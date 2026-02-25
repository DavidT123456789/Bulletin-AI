/**
 * @fileoverview Animation Manager — Skeleton loaders, typewriter reveals, text animations
 * Extracted from UIManager.js (Phase 2 — God Object Decomposition)
 * @module managers/AnimationManager
 */

import { Utils } from '../utils/Utils.js';

export const AnimationManager = {

    /**
     * Génère le HTML pour le skeleton de l'appréciation
     * @param {boolean} [compact=false] - Version compacte pour la vue liste
     * @param {string} [label='Génération...'] - Texte du badge
     * @param {boolean} [pending=false] - Si true, style "En attente"
     * @returns {string} HTML string
     */
    getSkeletonHTML(compact = false, label = 'Génération...', pending = false) {
        return Utils.getSkeletonHTML(compact, label, pending);
    },

    /**
     * Affiche un skeleton dans la zone d'appréciation d'une carte
     * @param {HTMLElement} card - La carte élève
     * @param {string} [badgeText='Génération...'] - Texte du badge
     * @param {boolean} [isPending=false] - Si true, affiche le style "en attente"
     */
    showSkeletonInCard(card, badgeText = 'Génération...', isPending = false) {
        if (!card) return;
        const appreciationEl = card.querySelector('[data-template="appreciation"]');
        if (appreciationEl) {
            appreciationEl.innerHTML = this.getSkeletonHTML(false, badgeText, isPending);
        }
    },

    /**
     * Met à jour le badge d'une carte pour indiquer la génération active
     * @param {HTMLElement} card - La carte élève
     */
    activateCardBadge(card) {
        if (!card) return;
        const badge = card.querySelector('.generating-badge');
        if (badge) {
            badge.innerHTML = '<iconify-icon icon="solar:spinner-bold-duotone" class="rotate-icon"></iconify-icon> Génération...';
            badge.classList.remove('pending');
            badge.classList.add('active');
        }
    },

    /**
     * Fait disparaître le skeleton en fondu
     * @param {HTMLElement} container - Le conteneur avec le skeleton
     */
    async fadeOutSkeleton(container) {
        if (!container) return;
        const skeleton = container.querySelector('.appreciation-skeleton');
        const badge = container.querySelector('.generating-badge');

        if (skeleton) {
            skeleton.style.transition = 'opacity 0.15s ease-out';
            skeleton.style.opacity = '0';
        }
        if (badge) {
            badge.style.transition = 'opacity 0.15s ease-out';
            badge.style.opacity = '0';
        }

        await new Promise(r => setTimeout(r, 150));

        if (skeleton) skeleton.remove();
        if (badge) badge.remove();
    },

    /**
     * Révèle le texte avec un effet de fondu progressif par mots
     * @param {HTMLElement} container - Le conteneur de l'appréciation
     * @param {string} text - Le texte à afficher
     * @param {Object} [options] - Options de configuration
     * @param {string} [options.speed='normal'] - 'slow', 'normal', 'fast'
     * @param {Function} [options.onProgress] - Callback appelé à chaque étape
     */
    async typewriterReveal(container, text, options = {}) {
        if (!container) return;

        await this.fadeOutSkeleton(container);
        container.innerHTML = '';

        const speedConfig = {
            slow: { wordDelay: 60, wordsPerBatch: 2 },
            normal: { wordDelay: 40, wordsPerBatch: 3 },
            fast: { wordDelay: 25, wordsPerBatch: 4 }
        };
        const config = speedConfig[options.speed] || speedConfig.normal;

        const words = text.split(/(\s+)/);

        const revealContainer = document.createElement('span');
        revealContainer.className = 'progressive-reveal';
        container.appendChild(revealContainer);

        const cursor = document.createElement('span');
        cursor.className = 'reveal-cursor';
        container.appendChild(cursor);

        const adaptiveDelay = Math.max(15, Math.min(config.wordDelay, 2000 / words.length));
        const isFast = text.length > 200;

        let wordIndex = 0;
        while (wordIndex < words.length) {
            const batch = words.slice(wordIndex, wordIndex + config.wordsPerBatch);

            for (const word of batch) {
                if (word.trim() === '') {
                    revealContainer.appendChild(document.createTextNode(word));
                } else {
                    const wordSpan = document.createElement('span');
                    wordSpan.className = 'reveal-word' + (isFast ? ' fast' : '');
                    wordSpan.textContent = word;
                    wordSpan.style.animationDelay = `${(wordIndex % config.wordsPerBatch) * 30}ms`;
                    revealContainer.appendChild(wordSpan);
                }
            }

            wordIndex += config.wordsPerBatch;
            await new Promise(r => setTimeout(r, adaptiveDelay));
        }

        cursor.style.transition = 'opacity 0.3s ease-out';
        cursor.style.opacity = '0';
        await new Promise(r => setTimeout(r, 300));
        cursor.remove();

        container.textContent = text;
    },

    /**
     * Révèle le contenu HTML avec un effet de fondu progressif par mots (compatible tags HTML)
     * @param {HTMLElement} container - Le conteneur cible
     * @param {string} htmlContent - La chaîne HTML à injecter et animer
     * @param {Object} [options] - Options de configuration
     */
    async animateHtmlReveal(container, htmlContent, options = {}) {
        if (!container) return;

        await this.fadeOutSkeleton(container);

        const speedConfig = {
            slow: { wordDelay: 60, wordsPerBatch: 2 },
            normal: { wordDelay: 40, wordsPerBatch: 3 },
            fast: { wordDelay: 25, wordsPerBatch: 4 }
        };
        const config = speedConfig[options.speed] || speedConfig.normal;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        const textNodes = [];
        const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
        let node;
        let totalWordCount = 0;
        while (node = walker.nextNode()) {
            if (node.textContent.trim().length > 0) {
                textNodes.push(node);
                totalWordCount += node.textContent.split(/\s+/).length;
            }
        }

        const isFast = totalWordCount > 100;

        let globalWordIndex = 0;
        let maxDelay = 0;

        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            const words = text.split(/(\s+)/);
            const fragment = document.createDocumentFragment();

            words.forEach(word => {
                if (word.trim() === '') {
                    fragment.appendChild(document.createTextNode(word));
                } else {
                    const wordSpan = document.createElement('span');
                    wordSpan.className = 'reveal-word' + (isFast ? ' fast' : '');
                    wordSpan.textContent = word;

                    const batchIndex = Math.floor(globalWordIndex / config.wordsPerBatch);
                    const offsetInBatch = globalWordIndex % config.wordsPerBatch;

                    const batchDelay = batchIndex * config.wordDelay;
                    const intraBatchDelay = offsetInBatch * 30;

                    const delay = batchDelay + intraBatchDelay;

                    wordSpan.style.animationDelay = `${delay}ms`;
                    fragment.appendChild(wordSpan);

                    globalWordIndex++;
                    maxDelay = Math.max(maxDelay, delay);
                }
            });

            textNode.parentNode.replaceChild(fragment, textNode);
        });

        container.innerHTML = '';
        container.className += ' progressive-reveal-container';

        while (tempDiv.firstChild) {
            container.appendChild(tempDiv.firstChild);
        }

        const cursor = document.createElement('span');
        cursor.className = 'reveal-cursor';
        container.appendChild(cursor);

        const totalDuration = maxDelay + 400;

        await new Promise(r => setTimeout(r, totalDuration + 100));

        cursor.style.transition = 'opacity 0.3s ease-out';
        cursor.style.opacity = '0';
        setTimeout(() => cursor.remove(), 300);
    },

    /**
     * Legacy: Effet de frappe caractère par caractère
     * @param {HTMLElement} element
     * @param {string} newHtml
     */
    async animateTextTyping(element, newHtml) {
        return new Promise(resolve => {
            if (!element) return resolve();

            const len = newHtml.replace(/<[^>]*>?/gm, '').length;
            const baseSpeed = 20;
            const maxSpeed = 2;
            const speed = Math.max(maxSpeed, baseSpeed - len * 0.1);

            let i = 0;
            element.innerHTML = '';
            let intervalId = setInterval(() => {
                if (i < newHtml.length) {
                    const char = newHtml[i];
                    if (char === '<') {
                        const tagEnd = newHtml.indexOf('>', i);
                        if (tagEnd !== -1) {
                            element.innerHTML += newHtml.substring(i, tagEnd + 1);
                            i = tagEnd;
                        }
                    } else {
                        element.innerHTML += char;
                    }
                    i++;
                } else {
                    clearInterval(intervalId);
                    element.innerHTML = newHtml;
                    resolve();
                }
            }, speed);
        });
    }
};
