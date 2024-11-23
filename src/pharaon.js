(function (window) {
    const MAX_EVENT_PARAMS_SIZE = 65536; // 64 KB limit
    const COOKIE_MAX_AGE = 31536000; // One year in seconds

    /**
     * Pharaon web tracking library
     */
    class Pharaon {
        constructor() {
            this.config = {};
            this.queue = [];
            this.isInitialized = false;
            this.userParams = {}; // Holds current user parameters

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

            if (this.config.debug) {
                console.log("Pharaon: Initialized with config:", this.config);
            }
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
                event_params: serializedParams,
            };

            if (this.config.debug) {
                console.log("Pharaon: Tracking Event:", event);
            }

            this.sendEvent(event);
        }

        /**
         * Sets user parameters.
         * @param {Object} params - User parameters to set.
         */
        setUserParams(params = {}) {
            if (typeof params !== "object" || Array.isArray(params)) {
                this.log("User parameters must be a flat object.", "error");
                return;
            }

            // Validate that userParams are flat and contain valid values
            const hasInvalidValues = Object.values(params).some(
                (value) =>
                    typeof value === "object" ||
                    typeof value === "function" ||
                    value === undefined
            );

            if (hasInvalidValues) {
                this.log("User parameters must be flat and not contain functions or undefined values.", "error");
                return;
            }

            // Merge new user parameters
            this.userParams = { ...this.userParams, ...params };

            const userParamsEvent = {
                user_pseudo_id: this.getUserPseudoId(),
                timestamp_assignment: new Date().toISOString(),
                user_params: JSON.stringify(this.userParams),
            };

            if (this.config.debug) {
                console.log("Pharaon: User Parameters Updated:", userParamsEvent);
            }

            this.sendUserParams(userParamsEvent);
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
            if (this.config.debug) {
                console.log("Pharaon: Event sent (logged for debugging):", event);
            } else {
                // Implement actual sending logic here
                console.log("Pharaon: Event:", event);
            }
        }

        /**
         * Sends the user parameters data.
         * @param {Object} userParams - User parameters data.
         */
        sendUserParams(userParams) {
            if (this.config.debug) {
                console.log("Pharaon: User Parameters Sent (logged for debugging):", userParams);
            } else {
                // Implement actual sending logic here
                console.log("Pharaon: User Parameters:", userParams);
            }
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
         * @param {string} type - Type of the log ('log', 'error', 'warn', etc.).
         */
        log(message, type = "log") {
            console[type](`Pharaon: ${message}`);
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
