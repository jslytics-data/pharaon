(function (window) {
    const pharaon = {
        config: {},
        queue: [],
        isInitialized: false,

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

            const event = {
                event_name: eventName,
                event_timestamp: new Date().toISOString(),
                ...this.getBrowserData(),
                ...eventData,
            };

            if (this.config.debug) {
                console.log("Tracking Event:", event);
            }

            this.sendEvent(event);
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

        // Modified sendEvent to log events instead of sending them to a server
        sendEvent(event) {
            if (this.config.debug) {
                console.log("Event sent (logged for debugging):", event);
            } else {
                console.log("Event:", event);
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
