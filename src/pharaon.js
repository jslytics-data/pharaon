(function (window) {
    const MAX_EVENT_PARAMS_SIZE = 65536; // 64 KB limit for event parameters
    const MAX_USER_IDENTIFIERS_SIZE = 2048; // 2 KB limit for user identifiers
    const COOKIE_MAX_AGE = 31536000; // One year in seconds

    /**
     * Pharaon web tracking library
     */
    class Pharaon {
        constructor() {
            this.config = {};
            this.queue = [];
            this.isInitialized = false;
            this.userIdentifiers = {}; // Holds current user identifiers

            // Check if localStorage is available
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
                this.isInitialized = true;
                this.processQueue();
                this.log("Initialized with config: " + JSON.stringify(this.config), "info");
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

                // Validate eventParams is a plain object
                if (!this.isPlainObject(eventParams)) {
                    this.log("eventParams must be a flat object.", "error", true);
                    return;
                }

                // Estimate serialized size before truncating
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

                    // Truncate eventParams object itself
                    eventParams = this.truncateObject(eventParams, MAX_EVENT_PARAMS_SIZE);
                }

                const event = {
                    event_name: eventName,
                    event_timestamp: new Date().toISOString(),
                    ...this.getBrowserData(),
                    event_params: eventParams,
                };

                this.log("Tracking Event:", "info", false, event);
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

                this.userIdentifiers = { ...this.userIdentifiers, ...identifiers };

                const userIdentifiersEvent = {
                    user_pseudo_id: this.getUserPseudoId(),
                    timestamp_assignment: new Date().toISOString(),
                    user_identifiers: identifiers,
                };

                this.log("User Identifiers Updated:", "info", false, userIdentifiersEvent);
            } catch (error) {
                this.log(`Error in setUserIdentifiers: ${error.message}`, "error", true);
            }
        }

        /**
         * Truncates an object to fit within a specified size limit while preserving JSON validity.
         * @param {Object} obj - The object to truncate.
         * @param {number} maxSize - The maximum size in bytes.
         * @returns {Object} - The truncated object.
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
         * @param {string} message - The message to log.
         * @param {string} type - The log type: 'info', 'warn', 'error', etc.
         * @param {boolean} force - If true, always log regardless of debug mode.
         * @param {Object} data - Optional data to log with the message.
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
         * @returns {Object} - Browser data.
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
         * @returns {string} - User pseudo ID.
         */
        getUserPseudoId() {
            let pseudoId = null;

            if (this.localStorageAvailable) {
                try {
                    pseudoId = localStorage.getItem("js_user_pseudo_id");
                } catch (e) {
                    this.log("Error accessing localStorage: " + e.message, "warn", true);
                    this.localStorageAvailable = false;
                }
            }

            if (!pseudoId) {
                pseudoId = this.getCookie("js_user_pseudo_id");
            }

            if (!pseudoId) {
                pseudoId = this.generateUUID();
                if (this.localStorageAvailable) {
                    try {
                        localStorage.setItem("js_user_pseudo_id", pseudoId);
                    } catch (e) {
                        this.log("Error setting item in localStorage: " + e.message, "warn", true);
                        this.localStorageAvailable = false;
                    }
                }
                try {
                    if (typeof document !== 'undefined') {
                        document.cookie = `js_user_pseudo_id=${pseudoId}; path=/; max-age=${COOKIE_MAX_AGE}; Secure; SameSite=Lax`;
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
         * @returns {boolean} - True if localStorage is available, false otherwise.
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
         * @returns {string} - UUID string.
         */
        generateUUID() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
                const buf = new Uint8Array(16);
                crypto.getRandomValues(buf);
                // Adapted from RFC 4122 version 4 UUID generation
                buf[6] = (buf[6] & 0x0f) | 0x40; // Version 4
                buf[8] = (buf[8] & 0x3f) | 0x80; // Variant 10

                const byteToHex = [];
                for (let i = 0; i < 256; ++i) {
                    byteToHex[i] = (i + 0x100).toString(16).substr(1);
                }

                let uuid = '';
                for (let i = 0; i < 16; ++i) {
                    uuid += byteToHex[buf[i]];
                    if (i === 3 || i === 5 || i === 7 || i === 9) {
                        uuid += '-';
                    }
                }
                return uuid;
            } else {
                // As a last resort, use Math.random (less secure)
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                    const r = Math.random() * 16 | 0;
                    const v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }
        }

        /**
         * Retrieves a cookie value by name.
         * @param {string} name - Cookie name.
         * @returns {string|null} - Cookie value or null if not found.
         */
        getCookie(name) {
            const escapedName = name.replace(/([.*+?^${}()|[\]\\])/g, '\\$1');
            const regex = new RegExp('(?:^|; )' + escapedName + '=([^;]*)');
            const match = (typeof document !== 'undefined' && document.cookie.match(regex));
            return match ? match[1] : null;
        }

        /**
         * Checks if a value is a plain object.
         * @param {any} obj - The value to check.
         * @returns {boolean} - True if obj is a plain object, false otherwise.
         */
        isPlainObject(obj) {
            return Object.prototype.toString.call(obj) === '[object Object]';
        }
    }

    // Instantiate and expose the Pharaon tracker
    window.pharaon = new Pharaon();
})(window);
