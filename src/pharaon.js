(function (window) {
    const MAX_EVENT_PARAMS_SIZE = 65536; // 64 KB limit for event parameters
    const MAX_USER_IDENTIFIERS_SIZE = 2048; // 2 KB limit for user identifiers
    const COOKIE_MAX_AGE = 31536000; // One year in seconds

    class Pharaon {
        constructor() {
            this.config = {};
            this.queue = [];
            this.isInitialized = false;
            this.userIdentifiers = {};

            this.localStorageAvailable = this.isLocalStorageAvailable();
            this.deviceUserAgent = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
            this.devicePlatform = (typeof navigator !== 'undefined' && navigator.platform) || '';
        }

        /**
         * Initializes the tracker with the given configuration.
         * @param {Object} config - Configuration object.
         */
        init(config) {
            try {
                this.config = { ...this.config, ...config };
                if (!this.config.endpoint) {
                    throw new Error("Endpoint URL is required in the config.");
                }
                this.isInitialized = true;
                this.processQueue();
                this.log(`Initialized with config: ${JSON.stringify(this.config)}`, "info");
            } catch (error) {
                this.log(`Error in init: ${error.message}`, "error", true);
            }
        }

        /**
         * Tracks an event with the given name and parameters.
         * @param {string} eventName - Name of the event to track.
         * @param {Object} eventParams - Parameters associated with the event.
         */
        trackEvent(eventName, eventParams = {}) {
            try {
                if (!this.isInitialized) {
                    this.queue.push({ eventName, eventParams });
                    return;
                }

                if (typeof eventName !== "string" || !eventName.trim()) {
                    this.log("Event name is required and must be a non-empty string.", "error", true);
                    return;
                }

                const MAX_EVENT_NAME_LENGTH = 256;
                if (eventName.length > MAX_EVENT_NAME_LENGTH) {
                    this.log(
                        `Event name length (${eventName.length} characters) exceeds the limit of ${MAX_EVENT_NAME_LENGTH}. Truncating.`,
                        "warn",
                        true
                    );
                    eventName = eventName.slice(0, MAX_EVENT_NAME_LENGTH);
                }

                if (!this.isPlainObject(eventParams)) {
                    this.log("eventParams must be a flat object.", "error", true);
                    return;
                }

                let serializedParams;
                try {
                    serializedParams = JSON.stringify(eventParams);
                } catch (error) {
                    this.log(`Failed to serialize eventParams: ${error.message}`, "error", true);
                    return;
                }

                if (serializedParams.length > MAX_EVENT_PARAMS_SIZE) {
                    this.log(
                        `event_params size (${serializedParams.length} bytes) exceeds the limit of ${MAX_EVENT_PARAMS_SIZE} bytes. Truncating.`,
                        "warn",
                        true
                    );
                    eventParams = this.truncateObject(eventParams, MAX_EVENT_PARAMS_SIZE);
                }

                const event = {
                    event_name: eventName,
                    event_timestamp: new Date().toISOString(),
                    ...this.getBrowserData(),
                    event_params: eventParams,
                };

                this.sendToServer(`${this.config.endpoint}/events`, event, "Event");
            } catch (error) {
                this.log(`Error in trackEvent: ${error.message}`, "error", true);
            }
        }

        /**
         * Sets user identifiers.
         * @param {Object} identifiers - User identifiers to set.
         */
        setUserIdentifiers(identifiers = {}) {
            try {
                if (!this.isPlainObject(identifiers)) {
                    this.log("User identifiers must be a flat object.", "error", true);
                    return;
                }

                let serializedIdentifiers;
                try {
                    serializedIdentifiers = JSON.stringify(identifiers);
                } catch (error) {
                    this.log(`Failed to serialize user identifiers: ${error.message}`, "error", true);
                    return;
                }

                if (serializedIdentifiers.length > MAX_USER_IDENTIFIERS_SIZE) {
                    this.log(
                        `user_identifiers size (${serializedIdentifiers.length} bytes) exceeds the limit of ${MAX_USER_IDENTIFIERS_SIZE} bytes. Operation rejected.`,
                        "error",
                        true
                    );
                    return;
                }

                const userIdentifiersEvent = {
                    user_pseudo_id: this.getUserPseudoId(),
                    timestamp_assignment: new Date().toISOString(),
                    user_identifiers: identifiers,
                };

                this.sendToServer(`${this.config.endpoint}/identifiers`, userIdentifiersEvent, "User Identifiers");
            } catch (error) {
                this.log(`Error in setUserIdentifiers: ${error.message}`, "error", true);
            }
        }

        /**
         * Sends data to the server via a POST request.
         * @param {string} url - The endpoint URL.
         * @param {Object} payload - The data to send.
         * @param {string} type - The type of data being sent (for logging).
         */
        sendToServer(url, payload, type) {
            try {
                fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })
                    .then((response) => {
                        if (!response.ok) {
                            this.log(`Failed to send ${type}. Response status: ${response.status}`, "error", true);
                        } else {
                            this.log(`${type} successfully sent to ${url}`, "info");
                        }
                    })
                    .catch((err) => {
                        this.log(`Error sending ${type}: ${err.message}`, "error", true);
                    });
            } catch (error) {
                this.log(`Error in sendToServer: ${error.message}`, "error", true);
            }
        }

        /**
         * Truncates an object to fit within a specified size limit while preserving JSON validity.
         */
        truncateObject(obj, maxSize) {
            let size = 0;

            const truncated = {};
            for (const [key, value] of Object.entries(obj)) {
                if (size >= maxSize) break;

                let entrySize;
                try {
                    entrySize = JSON.stringify({ [key]: value }).length;
                } catch (error) {
                    this.log(`Failed to serialize property ${key}: ${error.message}`, "error", true);
                    continue;
                }

                if (size + entrySize > maxSize) {
                    truncated[key] =
                        typeof value === "string" ? value.slice(0, maxSize - size) + "..." : value;
                    size = maxSize; // Enforce limit
                } else {
                    truncated[key] = value;
                    size += entrySize;
                }
            }

            return truncated;
        }

        /**
         * Logs messages to the console with a consistent prefix and conditional verbosity.
         */
        log(message, type = "log", force = false, data = null) {
            const prefix = "Pharaon: ";
            if (force || this.config.debug) {
                if (data) {
                    console[type](`${prefix}${message}`, data);
                } else {
                    console[type](`${prefix}${message}`);
                }
            }
        }

        /**
         * Retrieves browser data.
         */
        getBrowserData() {
            const userTimezone = (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';

            return {
                page_url: (typeof window !== 'undefined' && window.location && window.location.href) || '',
                page_referrer: (typeof document !== 'undefined' && document.referrer) || '',
                user_pseudo_id: this.getUserPseudoId(),
                user_timezone: userTimezone,
                browser_screen_size:
                    (typeof window !== 'undefined' && window.screen && `${window.screen.width}x${window.screen.height}`) || '',
                browser_viewport_size:
                    (typeof window !== 'undefined' && `${window.innerWidth}x${window.innerHeight}`) || '',
                browser_language: (typeof navigator !== 'undefined' && navigator.language) || '',
                device_user_agent: this.deviceUserAgent,
                device_platform: this.devicePlatform,
            };
        }

        /**
         * Retrieves or creates the user pseudo ID.
         */
        getUserPseudoId() {
            let pseudoId = null;

            // Try to retrieve from localStorage
            if (this.localStorageAvailable) {
                try {
                    pseudoId = localStorage.getItem("pharaon_user_pseudo_id");
                } catch (e) {
                    this.log("Error accessing localStorage: " + e.message, "warn", true);
                    this.localStorageAvailable = false;
                }
            }

            // Try to retrieve from cookies if not in localStorage
            if (!pseudoId) {
                pseudoId = this.getCookie("pharaon_user_pseudo_id");
            }

            // Generate a new UUID if not found
            if (!pseudoId) {
                try {
                    pseudoId = this.generateUUID();
                } catch (e) {
                    // If UUID generation fails, log error and abort tracking
                    this.log("Cannot generate user pseudo ID: " + e.message, "error", true);
                    throw new Error("Cannot proceed without a user pseudo ID.");
                }

                // Store in localStorage if available
                if (this.localStorageAvailable) {
                    try {
                        localStorage.setItem("pharaon_user_pseudo_id", pseudoId);
                    } catch (e) {
                        this.log("Error setting item in localStorage: " + e.message, "warn", true);
                        this.localStorageAvailable = false;
                    }
                }

                // Store in cookies
                try {
                    if (typeof document !== 'undefined') {
                        document.cookie = `pharaon_user_pseudo_id=${pseudoId}; path=/; max-age=${COOKIE_MAX_AGE}; Secure; SameSite=Lax`;
                    }
                } catch (e) {
                    this.log("Error setting cookie: " + e.message, "warn", true);
                }
            }

            return pseudoId;
        }


        /**
         * Processes the queued events.
         */
        processQueue() {
            this.queue.forEach(({ eventName, eventParams }) => {
                try {
                    this.trackEvent(eventName, eventParams);
                } catch (error) {
                    this.log(`Error processing queued event: ${error.message}`, "error", true);
                }
            });
            this.queue.length = 0; // Clear the queue
        }

        /**
         * Checks if localStorage is available.
         */
        isLocalStorageAvailable() {
            try {
                const testKey = "__pharaon_test__";
                localStorage.setItem(testKey, testKey);
                localStorage.removeItem(testKey);
                return true;
            } catch (e) {
                this.log("Local storage is not available.", "warn", true);
                return false;
            }
        }

        /**
         * Generates a UUID.
         */
        generateUUID() {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                // Use crypto.randomUUID if available (most modern browsers)
                return crypto.randomUUID();
            } else if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
                // Fallback to crypto.getRandomValues if crypto.randomUUID is not available
                const buf = new Uint8Array(16);
                crypto.getRandomValues(buf);

                // Per RFC 4122 v4 UUID
                buf[6] = (buf[6] & 0x0f) | 0x40; // Set version to 4
                buf[8] = (buf[8] & 0x3f) | 0x80; // Set variant to 10

                const byteToHex = [];
                for (let i = 0; i < 256; ++i) {
                    byteToHex.push((i + 0x100).toString(16).substr(1));
                }

                return (
                    byteToHex[buf[0]] +
                    byteToHex[buf[1]] +
                    byteToHex[buf[2]] +
                    byteToHex[buf[3]] +
                    '-' +
                    byteToHex[buf[4]] +
                    byteToHex[buf[5]] +
                    '-' +
                    byteToHex[buf[6]] +
                    byteToHex[buf[7]] +
                    '-' +
                    byteToHex[buf[8]] +
                    byteToHex[buf[9]] +
                    '-' +
                    byteToHex[buf[10]] +
                    byteToHex[buf[11]] +
                    byteToHex[buf[12]] +
                    byteToHex[buf[13]] +
                    byteToHex[buf[14]] +
                    byteToHex[buf[15]]
                );
            } else {
                // Secure methods are not available; log error and throw exception
                this.log(
                    "Secure random number generation is not available in this environment. Cannot generate a secure UUID.",
                    "error",
                    true
                );
                throw new Error("Secure random number generation is not available.");
            }
        }


        /**
         * Retrieves a cookie value by name.
         */
        getCookie(name) {
            const escapedName = name.replace(/([.*+?^${}()|[\\]\\\\])/g, '\\\\$1');
            const regex = new RegExp('(?:^|; )' + escapedName + '=([^;]*)');
            const match = (typeof document !== 'undefined' && document.cookie.match(regex));
            return match ? match[1] : null;
        }

        /**
         * Checks if a value is a plain object.
         */
        isPlainObject(obj) {
            return Object.prototype.toString.call(obj) === '[object Object]';
        }
    }

    // Preserve any existing pharaon object and its queue
    var existingPharaon = window.pharaon || {};
    var pharaonInstance = new Pharaon();

    // Process any queued method calls
    if (existingPharaon.q && existingPharaon.q.length > 0) {
        existingPharaon.q.forEach(function(item) {
            var methodName = item[0];
            var args = item[1];
            if (typeof pharaonInstance[methodName] === 'function') {
                pharaonInstance[methodName].apply(pharaonInstance, args);
            } else {
                pharaonInstance.log(`Method ${methodName} is not defined.`, "error", true);
            }
        });
    }

    // Replace the global pharaon object with the new instance
    window.pharaon = pharaonInstance;

})(window);
