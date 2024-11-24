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

            // Cache static values that are unlikely to change
            this.deviceUserAgent = navigator.userAgent;
            this.devicePlatform = navigator.platform;
        }

        /**
         * Initializes the Pharaon tracker with the given configuration.
         * @param {Object} config - Configuration object.
         */
        init(config) {
            this.config = { ...this.config, ...config };
            this.isInitialized = true;
            this.processQueue();

            this.log(`Initialized with config:`, 'info', this.config);
        }

        /**
         * Tracks an event with the given name and parameters.
         * @param {string} eventName - Name of the event to track.
         * @param {Object} eventParams - Parameters associated with the event.
         */
        trackEvent(eventName, eventParams = {}) {
            if (!this.isInitialized) {
                this.queue.push({ eventName, eventParams });
                return;
            }

            if (typeof eventName !== "string" || !eventName.trim()) {
                this.log("Event name is required and must be a non-empty string.", "error");
                return;
            }

            // Serialize eventParams
            let serializedParams = JSON.stringify(eventParams);

            // Check size and truncate if necessary
            if (serializedParams.length > MAX_EVENT_PARAMS_SIZE) {
                this.log(
                    `event_params size (${serializedParams.length} bytes) exceeds the limit of ${MAX_EVENT_PARAMS_SIZE} bytes. Truncating.`,
                    "warn"
                );

                // Truncate oversized parameters
                serializedParams = serializedParams.slice(0, MAX_EVENT_PARAMS_SIZE - 3) + "...";
            }

            const event = {
                event_name: eventName,
                event_timestamp: new Date().toISOString(),
                ...this.getBrowserData(),
                event_params: eventParams, // Keep as an object
            };

            this.sendEvent(event);
        }

        /**
         * Sets user identifiers.
         * @param {Object} identifiers - User identifiers to set.
         */
        setUserIdentifiers(identifiers = {}) {
            if (typeof identifiers !== "object" || Array.isArray(identifiers)) {
                this.log("User identifiers must be a flat object.", "error");
                return;
            }

            // Validate that userIdentifiers are flat and contain valid values
            const hasInvalidValues = Object.values(identifiers).some(
                (value) =>
                    typeof value === "object" ||
                    typeof value === "function" ||
                    value === undefined
            );

            if (hasInvalidValues) {
                this.log("User identifiers must be flat and not contain functions or undefined values.", "error");
                return;
            }

            // Serialize to check size
            const serializedIdentifiers = JSON.stringify(identifiers);
            if (serializedIdentifiers.length > MAX_USER_IDENTIFIERS_SIZE) {
                this.log(
                    `user_identifiers size (${serializedIdentifiers.length} bytes) exceeds the limit of ${MAX_USER_IDENTIFIERS_SIZE} bytes. Operation rejected.`,
                    "error"
                );
                return;
            }

            // Merge new user identifiers
            this.userIdentifiers = { ...this.userIdentifiers, ...identifiers };

            const userIdentifiersEvent = {
                user_pseudo_id: this.getUserPseudoId(),
                timestamp_assignment: new Date().toISOString(),
                user_identifiers: identifiers, // Keep as an object
            };

            this.sendUserIdentifiers(userIdentifiersEvent);
        }

        /**
         * Retrieves browser data.
         * @returns {Object} - Browser data.
         */
        getBrowserData() {
            // Get current timezone in case it changed
            const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            return {
                page_url: window.location.href,
                page_referrer: document.referrer || null,
                user_pseudo_id: this.getUserPseudoId(),
                user_timezone: userTimezone,
                browser_screen_size: `${window.screen.width}x${window.screen.height}`,
                browser_viewport_size: `${window.innerWidth}x${window.innerHeight}`,
                browser_language: navigator.language,
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
                pseudoId = localStorage.getItem("js_user_pseudo_id");
            } else {
                pseudoId = this.getCookie("js_user_pseudo_id");
            }

            if (!pseudoId) {
                pseudoId = this.generateUUID();
                if (this.localStorageAvailable) {
                    localStorage.setItem("js_user_pseudo_id", pseudoId);
                }
                document.cookie = `js_user_pseudo_id=${pseudoId}; path=/; max-age=${COOKIE_MAX_AGE}; Secure; SameSite=Lax`;
            }

            return pseudoId;
        }

        /**
         * Sends the event data.
         * @param {Object} event - Event data.
         */
        sendEvent(event) {
            this.log(`Event:`, 'info', event);
        }

        /**
         * Sends the user identifiers data.
         * @param {Object} userIdentifiers - User identifiers data.
         */
        sendUserIdentifiers(userIdentifiers) {
            this.log(`User Identifiers:`, 'info', userIdentifiers);
        }

        /**
         * Processes the queued events.
         */
        processQueue() {
            this.queue.forEach(({ eventName, eventParams }) => {
                this.trackEvent(eventName, eventParams);
            });
            this.queue.length = 0; // Clear the queue
        }

        /**
         * Logs messages with the specified type.
         * @param {string} message - Message to log.
         * @param {string} type - Type of the log ('log', 'info', 'warn', 'error').
         * @param {Object} [data] - Optional data to log alongside the message.
         */
        log(message, type = "log", data) {
            const prefixedMessage = `Pharaon: ${message}`;

            if (type === 'error' || type === 'warn') {
                if (data !== undefined) {
                    console[type](prefixedMessage, data);
                } else {
                    console[type](prefixedMessage);
                }
            } else if (this.config.debug) {
                if (data !== undefined) {
                    console[type](prefixedMessage, data);
                } else {
                    console[type](prefixedMessage);
                }
            }
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
                this.log("Local storage is not available.", "warn");
                return false;
            }
        }

        /**
         * Generates a UUID.
         * @returns {string} - UUID string.
         */
        generateUUID() {
            if (window.crypto && crypto.randomUUID) {
                return crypto.randomUUID();
            } else {
                // Fallback UUID generation
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                    const r = (Math.random() * 16) | 0;
                    const v = c === 'x' ? r : (r & 0x3) | 0x8;
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
            const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
            return match ? match[2] : null;
        }
    }

    // Instantiate and expose the Pharaon tracker
    window.pharaon = new Pharaon();
})(window);
