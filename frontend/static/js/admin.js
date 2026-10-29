/* Console d'administration GOLD FX — logique (etat, prompt, emoji). */

(() => {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const icons = () => window.lucide && window.lucide.createIcons();
    const selectedEmojis = [];
    let emojiSeed = 7;
    let uptimeSeconds = 0;

    /* --- Utilitaires --- */
    function toast(message, isError = false) {
        const node = document.createElement("div");
        node.className = "toast" + (isError ? " error" : "");
        node.textContent = message;
        $("toasts").appendChild(node);
        setTimeout(() => node.remove(), 4200);
    }

    async function api(url, options) {
        const response = await fetch(url, { credentials: "same-origin", ...options });
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.json();
    }

    function countUp(element, target) {
        const value = Number(target);
        if (!Number.isFinite(value)) {
            element.textContent = "—";
            return;
        }
        const duration = 700;
        const started = performance.now();
        function step(now) {
            const progress = Math.min(1, (now - started) / duration);
            element.textContent = Math.round(value * (1 - Math.pow(1 - progress, 3))).toLocaleString("fr-FR");
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function formatUptime(total) {
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const seconds = Math.floor(total % 60);
        return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
    }

    /* --- Vue d'ensemble --- */
    async function loadOverview() {
        try {
            const data = await api("/api/admin/overview");
            $("versionPill").textContent = `v${data.app.version}`;
            uptimeSeconds = data.app.uptime_seconds;

            countUp($("kpiUsers"), data.users);
            countUp($("kpiVideos"), data.media.videos);
            countUp($("kpiImages"), data.media.images);
            countUp($("kpiEmojis"), data.emojis);
            $("emojiCount").textContent = data.emojis ? `${data.emojis} emojis` : "jeu non chargé";

            renderProviders(data.providers);
            renderConfig(data.config, data.app);
            icons();
        } catch (error) {
            toast(`Impossible de charger l'état : ${error.message}`, true);
        }
    }

    function renderProviders(providers) {
        $("providers").innerHTML = providers
            .map((provider, index) => {
                const state = provider.reachable ? "live" : "";
                const label = provider.reachable ? "en ligne" : "hors ligne";
                const caps = provider.capabilities.map((cap) => `<span class="cap">${cap}</span>`).join("");
                const quota =
                    provider.quota_remaining === null
                        ? `<div class="quota-label">Quota : illimité</div>`
                        : `<div class="quota"><div class="quota-bar"><i style="width:${Math.min(100, provider.quota_remaining)}%"></i></div>
                           <div class="quota-label">${provider.quota_remaining} requête(s) restante(s)</div></div>`;
                return `<article class="provider" style="animation-delay:${index * 60}ms">
                            <div class="provider-top">
                                <span class="provider-name">${provider.name}</span>
                                <span class="provider-status"><span class="dot ${state}"></span>${label}</span>
                            </div>
                            <div class="caps">${caps}</div>
                            ${quota}
                        </article>`;
            })
            .join("");
    }

    function renderConfig(config, app) {
        const entries = [
            ["stockage", config.user_store],
            ["priorité", config.provider_priority.join(" → ")],
            ["gzip", config.gzip ? "activé" : "désactivé"],
            ["upload max", `${config.max_upload_mb} Mo`],
            ["cache", `${config.cache_ttl_seconds} s`],
            ["sessions HTTPS", config.session_https_only ? "oui" : "non"],
            ["python", app.python],
            ["système", app.platform],
        ];
        $("config").innerHTML = entries.map(([key, value]) => `<span class="chip">${key} <b>${value}</b></span>`).join("");
    }

    /* --- Studio de prompt --- */
    async function enhancePrompt() {
        const text = $("promptText").value.trim();
        if (!text) {
            toast("Écrivez d'abord une demande.", true);
            return;
        }
        const button = $("enhanceBtn");
        button.disabled = true;
        try {
            const data = await api("/api/prompt/enhance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, model: $("promptModel").value, use_llm: $("useLlm").checked }),
            });
            const output = $("promptOutput");
            output.classList.add("filled");
            output.innerHTML = `
                <div class="badges">
                    <span class="cap">intention : ${data.intent}</span>
                    <span class="cap">modèle : ${data.model}</span>
                    <span class="cap">source : ${data.source}</span>
                </div>
                <p class="prompt-text" id="enhancedText">${escapeHtml(data.enhanced)}</p>
                <button class="btn ghost small" id="copyPrompt"><i data-lucide="copy"></i> Copier</button>
                <ul class="tips">${data.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul>`;
            $("copyPrompt").addEventListener("click", () => copy(data.enhanced));
            icons();
        } catch (error) {
            toast(`Amélioration impossible : ${error.message}`, true);
        } finally {
            button.disabled = false;
        }
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])
        );
    }

    async function copy(value) {
        try {
            await navigator.clipboard.writeText(value);
            toast("Prompt copié.");
        } catch {
            toast("Copie impossible (permissions du navigateur).", true);
        }
    }

    /* --- Studio emoji --- */
    let searchTimer = null;
    function onSearchInput() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(searchEmojis, 180);
    }

    async function searchEmojis() {
        const query = $("emojiSearch").value.trim();
        if (!query) {
            $("emojiResults").innerHTML = `<div class="empty"><i data-lucide="search"></i><span>Recherchez un emoji.</span></div>`;
            icons();
            return;
        }
        try {
            const data = await api(`/api/emoji/search?q=${encodeURIComponent(query)}&limit=90`);
            if (!data.results.length) {
                $("emojiResults").innerHTML = `<div class="empty"><span>Aucun résultat.</span></div>`;
                return;
            }
            $("emojiResults").innerHTML = data.results
                .map((item) => {
                    const label = item.label_fr || item.label_en || "";
                    return `<button class="emoji-btn" data-emoji="${item.emoji}" title="${escapeHtml(label)}">${item.emoji}</button>`;
                })
                .join("");
            $("emojiResults").querySelectorAll(".emoji-btn").forEach((button) => {
                button.addEventListener("click", () => toggleEmoji(button.dataset.emoji));
            });
        } catch (error) {
            toast(`Recherche impossible : ${error.message}`, true);
        }
    }

    function toggleEmoji(emoji) {
        const index = selectedEmojis.indexOf(emoji);
        if (index === -1) selectedEmojis.push(emoji);
        else selectedEmojis.splice(index, 1);
        generatePlan({ emojis: selectedEmojis });
    }

    async function generatePlan(body) {
        if (body.emojis && !body.emojis.length && !body.prompt) {
            renderPlan({ canvas: { width: 640, height: 360 }, layers: [] });
            return;
        }
        try {
            const data = await api("/api/emoji/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...body, seed: emojiSeed }),
            });
            renderPlan(data);
        } catch (error) {
            toast(`Génération impossible : ${error.message}`, true);
        }
    }

    function renderPlan(plan) {
        $("layers").innerHTML = plan.layers.length
            ? plan.layers
                  .map(
                      (layer, index) => `<div class="layer" style="animation-delay:${index * 45}ms">
                            <em>${layer.emoji}</em> ${escapeHtml(layer.name)} · ×${layer.quantity} · ${layer.size}px</div>`
                  )
                  .join("")
            : `<div class="empty small"><span>Aucun calque.</span></div>`;
        drawPlan(plan);
    }

    function drawPlan(plan) {
        const canvas = $("emojiCanvas");
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        const scale = canvas.width / (plan.canvas.width || 1);
        context.textAlign = "center";
        context.textBaseline = "middle";
        plan.layers.forEach((layer) => {
            context.globalAlpha = (layer.opacity ?? 100) / 100;
            context.font = `${layer.size * scale}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            layer.positions.forEach((position) => {
                context.save();
                context.translate(position.x * scale, position.y * scale);
                context.rotate(((layer.rotation || 0) * Math.PI) / 180);
                context.fillText(layer.emoji, 0, 0);
                context.restore();
            });
        });
        context.globalAlpha = 1;
    }

    /* --- Initialisation --- */
    function bind() {
        $("refreshBtn").addEventListener("click", loadOverview);
        $("enhanceBtn").addEventListener("click", enhancePrompt);
        $("emojiSearch").addEventListener("input", onSearchInput);
        $("planBtn").addEventListener("click", () => {
            const prompt = $("emojiPrompt").value.trim();
            if (!prompt) {
                toast("Écrivez une composition (ex. « 2 voitures et un avion »).", true);
                return;
            }
            selectedEmojis.length = 0;
            generatePlan({ prompt });
        });
        $("emojiPrompt").addEventListener("keydown", (event) => {
            if (event.key === "Enter") $("planBtn").click();
        });
    }

    function startUptimeTicker() {
        setInterval(() => {
            uptimeSeconds += 1;
            $("uptimePill").innerHTML = `<span class="dot live"></span> ${formatUptime(uptimeSeconds)}`;
        }, 1000);
    }

    document.addEventListener("DOMContentLoaded", () => {
        bind();
        loadOverview();
        startUptimeTicker();
        setInterval(loadOverview, 20000);
        icons();
    });
})();
