(function (window) {
    const MAX_EVENT_PARAMS_SIZE = 65536; // 64 KB limit

    const pharaon = {
        config: {},
        queue: [],
        isInitialized: false,
        userParams: {}, // Holds current user params

        init(config) {
            this.config = { ...this.config, ...config };
            this.isInitialized = true;
            this.processQueue();

            if (this.config.debug) {
                console.log("Pharaon initialized with config:", this.config);
            }
        },

        track(eventName, eventData = {}) {
            if (!eventName || typeof eventName !== "string") {
                console.error("Event name is required and must be a string");
                return;
            }

            if (!this.isInitialized) {
                this.queue.push({ eventName, eventData });
                return;
            }

            // Serialize event_params and check size
            let serializedParams = JSON.stringify(eventData);
            if (serializedParams.length > MAX_EVENT_PARAMS_SIZE) {
                console.warn(
                    `event_params size (${serializedParams.length} bytes) exceeds the limit of ${MAX_EVENT_PARAMS_SIZE} bytes. Truncating.`
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
                console.log("Tracking Event:", event);
            }

            this.sendEvent(event);
        },

        setUserParams(params = {}) {
            if (typeof params !== "object" || Array.isArray(params)) {
                console.error("User parameters must be a flat object.");
                return;
            }

            // Validate the user_params are flat and non-nested
            const isNested = Object.values(params).some(
                (value) => typeof value === "object" && !Array.isArray(value)
            );
            if (isNested) {
                console.error("User parameters must not contain nested objects.");
                return;
            }

            // Assign new user params and log for debugging
            this.userParams = { ...this.userParams, ...params };

            const userParamsEvent = {
                user_pseudo_id: this.getOrCreateUserPseudoId(),
                timestamp_assignment: new Date().toISOString(),
                user_params: JSON.stringify(this.userParams),
            };

            if (this.config.debug) {
                console.log("User Parameters Updated:", userParamsEvent);
            }

            this.sendUserParams(userParamsEvent);
        },

        getBrowserData() {
            return {
                page_url: window.location.href,
                page_referrer: document.referrer || null,
                user_pseudo_id: this.getOrCreateUserPseudoId(),
                user_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                browser_screen_size: `${window.screen.width}x${window.screen.height}`,
                browser_viewport_size: `${window.innerWidth}x${window.innerHeight}`,
                browser_language: navigator.language,
                device_user_agent: navigator.userAgent,
                device_platform: navigator.platform,
            };
        },

        getOrCreateUserPseudoId() {
            let pseudoId = localStorage.getItem("js_user_pseudo_id");
            if (!pseudoId) {
                pseudoId = crypto.randomUUID();
                localStorage.setItem("js_user_pseudo_id", pseudoId);
                document.cookie = `js_user_pseudo_id=${pseudoId}; path=/; max-age=31536000; Secure; SameSite=Lax`;
            }
            return pseudoId;
        },

        sendEvent(event) {
            if (this.config.debug) {
                console.log("Event sent (logged for debugging):", event);
            } else {
                console.log("Event:", event);
            }
        },

        sendUserParams(userParams) {
            if (this.config.debug) {
                console.log("User Parameters Sent (logged for debugging):", userParams);
            } else {
                console.log("User Parameters:", userParams);
            }
        },

        processQueue() {
            while (this.queue.length) {
                const { eventName, eventData } = this.queue.shift();
                this.track(eventName, eventData);
            }
        },
    };

    window.pharaon = pharaon;
})(window);
