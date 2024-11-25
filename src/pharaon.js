(function (window) {
    const MAX_EVENT_PARAMS_SIZE = 65536; // 64 KB limit for event parameters
    const MAX_USER_IDENTIFIERS_SIZE = 2048; // 2 KB limit for user identifiers
    const COOKIE_MAX_AGE = 31536000; // One year in seconds
    const MAX_EVENT_NAME_LENGTH = 256;

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
            this.deviceUserAgent = navigator.userAgent;
            this.devicePlatform = navigator.platform;
        }

        /**
         * Initializes the tracker with the given configuration.
         * @param {Object} config - Configuration object.
         */
        init(config) {
            this.config = { ...this.config, ...config };
            this.isInitialized = true;
            this.processQueue();
            this.log("Initialized with config: " + JSON.stringify(this.config), "info");
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

            let serializedParams = JSON.stringify(eventParams);

            if (serializedParams.length > MAX_EVENT_PARAMS_SIZE) {
                this.log(
                    `event_params size (${serializedParams.length} bytes) exceeds the limit of ${MAX_EVENT_PARAMS_SIZE} bytes. Truncating.`,
                    "warn",
                    true
                );
                serializedParams = serializedParams.slice(0, MAX_EVENT_PARAMS_SIZE - 3) + "...";
            }

            const event = {
                event_name: eventName,
                event_timestamp: new Date().toISOString(),
                ...this.getBrowserData(),
                event_params: serializedParams,
            };

            this.log("Tracking Event:", "info", false, event);
        }



        /**
         * Sets user identifiers.
         * @param {Object} identifiers - User identifiers to set.
         */
        setUserIdentifiers(identifiers = {}) {
            if (typeof identifiers !== "object" || Array.isArray(identifiers)) {
                this.log("User identifiers must be a flat object.", "error", true);
                return;
            }

            const serializedIdentifiers = JSON.stringify(identifiers);

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
        }



        /**
         * Logs messages to the console with a consistent prefix and conditional verbosity.
         * @param {string} message - The message to log.
         * @param {string} type - The log type: 'info', 'warn', 'error', etc.
         * @param {boolean} force - If true, always log regardless of debug mode.
         */
        log(message, type = "log", force = false, data = null) {
            const prefix = "Pharaon: ";
            if (force || this.config.debug) {
                if (data && typeof data === "object") {
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
         * Processes the queued events.
         */
        processQueue() {
            this.queue.forEach(({ eventName, eventParams }) => {
                this.trackEvent(eventName, eventParams);
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
            if (window.crypto && crypto.randomUUID) {
                return crypto.randomUUID();
            } else {
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
