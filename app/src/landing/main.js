/**
 * @fileoverview Landing page controller for Bulletin AI (navigation, carousel, hero mockup, PWA/transition).
 */

const prefersReducedMotion = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false, addEventListener: () => {} };

const CAROUSEL_ITEMS = [
    { icon: 'solar:stars-linear', color: 'bg-purple-50 text-purple-600', title: 'Rédaction & Affinage IA', desc: 'Générez sur mesure et ajustez le ton en un clic : concis, encourageant ou peaufiné.', label: 'Rédaction' },
    { icon: 'solar:notebook-linear', color: 'bg-rose-50 text-rose-600', title: 'Journal de Bord', desc: 'Consignez vos observations au fil des séances (clavier ou dictée vocale) pour nourrir le bilan.', label: 'Suivi' },
    { icon: 'solar:chart-square-linear', color: 'bg-orange-50 text-orange-600', title: 'Statistiques & Dynamique', desc: 'Visualisez moyenne, médiane, répartition et évolution (progrès, stabilité, régression) de la classe.', label: 'Analyse' },
    { icon: 'solar:file-text-linear', color: 'bg-blue-50 text-blue-600', title: 'Import PDF & Tableurs', desc: 'Compatible bilans et trombinoscopes PDF (Pronote, MBN), Excel, CSV ou copier-coller.', label: 'Import' },
    { icon: 'solar:archive-linear', color: 'bg-cyan-50 text-cyan-600', title: 'Trombinoscope & Sauvegarde', desc: 'Visualisez vos élèves et archivez vos classes en local ou sur votre Google Drive personnel.', label: 'Stockage' },
    { icon: 'solar:shield-keyhole-linear', color: 'bg-green-50 text-green-600', title: 'Pseudonymisation RGPD', desc: 'Prénoms masqués par défaut, noms et statuts sensibles (PAP, ULIS…) filtrés localement avant tout envoi IA.', label: 'Sécurité' },
    { icon: 'solar:server-square-linear', color: 'bg-amber-50 text-amber-600', title: 'Multi-Modèles IA', desc: 'Compatible Albert (IA Gouv.fr via ProConnect), Gemini, Groq, Mistral ou Ollama 100% hors-ligne.', label: 'Flexible' },
    { icon: 'solar:users-group-rounded-linear', color: 'bg-indigo-50 text-indigo-600', title: 'Plan & Groupes', desc: 'Placement en classe, binômes ou îlots d\'activité équilibrés et export PDF.', label: 'Organisation' }
];

const MOCKUP_STUDENTS = {
    matheo: {
        status: 'Dispositif · PAP',
        grade: '8,5',
        trend: '-2,0',
        trendDir: 'down',
        obs: [
            { label: 'Bavardages ×3', tone: 'warn' },
            { label: 'Oral volontaire', tone: 'pos' }
        ],
        context: "« Bonnes capacités d'analyse, mais un travail personnel trop irrégulier. »",
        texts: {
            bienveillant: "Des résultats fragiles ce trimestre, mais Mathéo montre de vraies capacités et participe bien à l'oral. Avec un travail plus régulier et moins de bavardages, il progressera vite.",
            neutre: "Ensemble en baisse ce trimestre malgré une bonne participation orale. Entre bavardages répétés et travail personnel trop irrégulier, Mathéo doit se recentrer pour consolider ses acquis.",
            exigeant: "Trimestre insuffisant et en net recul. De bonnes capacités ne suffisent pas : les bavardages doivent cesser et le travail personnel gagner en régularité et en rigueur."
        },
        refinements: {
            concise: {
                bienveillant: "Résultats fragiles, mais Mathéo participe bien à l'oral. Un travail plus régulier l'aidera vite à progresser.",
                neutre: "Trimestre en baisse malgré un oral volontaire. Moins de bavardages et plus de régularité sont nécessaires.",
                exigeant: "Trimestre insuffisant et en recul. Les bavardages doivent cesser au profit d'un travail régulier."
            },
            polish: {
                bienveillant: "Malgré des résultats encore fragiles, Mathéo fait preuve de finesse d'analyse et participe volontiers à l'oral. En régularisant son travail et son écoute, ses progrès seront rapides.",
                neutre: "Les résultats fléchissent ce trimestre malgré de réelles capacités et un oral actif. En freinant ses bavardages et en travaillant plus régulièrement, Mathéo consolidera vite ses acquis.",
                exigeant: "Ensemble insuffisant et en recul ce trimestre. Malgré de réelles capacités d'analyse, les bavardages et l'irrégularité du travail personnel freinent les progrès : rigueur et sérieux sont impératifs."
            }
        }
    },
    sophie: {
        status: 'Dispositif · PPRE',
        grade: '11,5',
        trend: '+1,5',
        trendDir: 'up',
        obs: [
            { label: 'Efforts réguliers', tone: 'pos' },
            { label: 'Écrit à affermir', tone: 'amber' }
        ],
        context: "« Gagne en confiance grâce au suivi. »",
        texts: {
            bienveillant: "Bravo pour ces progrès très encourageants ! Les efforts réguliers de Sophie portent enfin leurs fruits : elle gagne en aisance à l'oral et aborde l'écrit plus sereinement.",
            neutre: "Résultats en nette progression ce trimestre. Grâce à des efforts réguliers en classe et au suivi mis en place, Sophie gagne en confiance et consolide durablement ses acquis.",
            exigeant: "Évolution positive qui vient récompenser un travail devenu plus régulier. Les bases sont désormais mieux assurées, mais Sophie doit gagner en précision et en autonomie face aux écrits."
        },
        refinements: {
            concise: {
                bienveillant: "Progrès encourageants ce trimestre ! Sophie gagne en assurance grâce à un travail devenu plus régulier.",
                neutre: "Nette progression ce trimestre. Un travail régulier permet à Sophie de consolider sereinement ses acquis.",
                exigeant: "Des progrès grâce à un travail régulier. Il faut désormais gagner en précision à l'écrit."
            },
            polish: {
                bienveillant: "Félicitations pour cette belle dynamique ce trimestre. Grâce à des efforts constants, Sophie prend confiance à l'oral et aborde désormais les travaux écrits avec beaucoup de sérénité.",
                neutre: "Trimestre solide et en nette hausse. Soutenue par un suivi régulier, Sophie travaille avec sérieux, s'exprime avec plus d'assurance à l'oral et stabilise durablement ses bases écrites.",
                exigeant: "Progrès notables, fruits d'un travail plus constant ce trimestre. Les fondations se stabilisent, mais Sophie doit maintenant viser davantage d'autonomie, de méthode et de rigueur à l'écrit."
            }
        }
    },
    lucas: {
        status: '',
        grade: '14,5',
        trend: '+0,5',
        trendDir: 'up',
        obs: [
            { label: 'Oral moteur', tone: 'pos' },
            { label: 'Devoirs soignés', tone: 'pos' }
        ],
        context: "« Réflexions fines et pertinentes, investissement constant depuis la rentrée. »",
        texts: {
            bienveillant: "Lucas s'investit avec enthousiasme et finesse tout au long du trimestre. Sa participation orale dynamise toute la classe et ses écrits révèlent une réflexion toujours plus personnelle.",
            neutre: "Bon trimestre, solide et toujours en progrès. Élève moteur en classe, Lucas participe activement aux échanges oraux et propose des analyses structurées dans des devoirs très soignés.",
            exigeant: "Très bon ensemble porté par un oral pertinent et des devoirs soignés. Lucas peut encore affiner sa rigueur méthodologique à l'écrit pour franchir un nouveau cap d'excellence."
        },
        refinements: {
            concise: {
                bienveillant: "Très beau trimestre ! Élève moteur à l'oral, Lucas produit aussi des écrits très soignés.",
                neutre: "Trimestre solide et en progrès. Participation motrice à l'oral et devoirs particulièrement bien structurés.",
                exigeant: "Très bon trimestre, oral pertinent et devoirs soignés. Affiner la méthode permettra d'exceller encore."
            },
            polish: {
                bienveillant: "Lucas réalise un très beau trimestre à tous niveaux. Son enthousiasme à l'oral entraîne le groupe et ses devoirs soignés témoignent d'une réflexion de plus en plus fine et nuancée.",
                neutre: "Ensemble solide et en progression régulière. Élève moteur en cours, Lucas enrichit les échanges par des interventions toujours pertinentes et rend des écrits particulièrement rigoureux.",
                exigeant: "Très bon niveau général, soutenu par des devoirs soignés et un oral constructif. Davantage de précision méthodologique à l'écrit lui permettra vite d'atteindre le seuil d'excellence."
            }
        }
    }
};

const TONE_SEQUENCE = ['neutre', 'exigeant', 'bienveillant'];
const OBS_DOT_CLASSES = { warn: 'is-warn', amber: 'is-amber', pos: 'is-pos' };

/**
 * Adds a class once when matched elements enter the viewport, then stops observing.
 */
function observeOnce(selector, activeClass, threshold) {
    const elements = document.querySelectorAll(selector);
    if (!elements.length) return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add(activeClass);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold });
    elements.forEach((el) => observer.observe(el));
}

function initNavbarAndScroll() {
    const yearEl = document.getElementById('currentYear');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    const navbar = document.getElementById('navbar');
    const scrollTopBtn = document.getElementById('scrollTopBtn');
    const sections = document.querySelectorAll('section[id], header[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    function syncScrollUI() {
        const scrollY = window.scrollY;
        if (navbar) navbar.classList.toggle('is-scrolled', scrollY > 16);
        if (scrollTopBtn) scrollTopBtn.classList.toggle('is-visible', scrollY > 500);
    }

    let scrollTicking = false;
    window.addEventListener('scroll', () => {
        if (scrollTicking) return;
        requestAnimationFrame(() => {
            syncScrollUI();
            scrollTicking = false;
        });
        scrollTicking = true;
    }, { passive: true });
    syncScrollUI();

    if (sections.length && navLinks.length) {
        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const activeId = entry.target.id;
                navLinks.forEach((link) => {
                    const isMatch = link.getAttribute('data-target') === activeId;
                    link.classList.toggle('active', isMatch);
                    if (isMatch) link.setAttribute('aria-current', 'location');
                    else link.removeAttribute('aria-current');
                });
            });
        }, { root: null, rootMargin: '-20% 0px -70% 0px', threshold: 0 });
        sections.forEach((section) => sectionObserver.observe(section));
    }

    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
}

function initMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileBackdrop = document.getElementById('mobile-backdrop');
    const mobilePanel = document.getElementById('mobile-panel');
    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const mobileCloseBtn = document.getElementById('mobileCloseBtn');
    if (!mobileMenu || !mobileBackdrop || !mobilePanel || !menuToggleBtn || !mobileCloseBtn) return;

    let isMenuOpen = false;
    let menuFocusTimeout = null;

    function toggleMenu() {
        if (menuFocusTimeout) {
            clearTimeout(menuFocusTimeout);
            menuFocusTimeout = null;
        }
        isMenuOpen = !isMenuOpen;
        menuToggleBtn.setAttribute('aria-expanded', String(isMenuOpen));
        mobileMenu.setAttribute('aria-hidden', String(!isMenuOpen));
        mobileMenu.inert = !isMenuOpen;
        if (isMenuOpen) {
            mobileMenu.classList.remove('pointer-events-none');
            mobileBackdrop.classList.remove('opacity-0');
            mobilePanel.classList.remove('mobile-menu-enter');
            mobilePanel.classList.add('mobile-menu-active');
            document.body.style.overflow = 'hidden';
            const firstLink = mobilePanel.querySelector('a');
            if (firstLink) menuFocusTimeout = setTimeout(() => firstLink.focus(), 350);
        } else {
            mobileMenu.classList.add('pointer-events-none');
            mobileBackdrop.classList.add('opacity-0');
            mobilePanel.classList.remove('mobile-menu-active');
            mobilePanel.classList.add('mobile-menu-enter');
            document.body.style.overflow = '';
            menuToggleBtn.focus();
        }
    }

    menuToggleBtn.addEventListener('click', toggleMenu);
    mobileBackdrop.addEventListener('click', toggleMenu);
    mobileCloseBtn.addEventListener('click', toggleMenu);
    mobilePanel.querySelectorAll('[data-close-menu]').forEach((link) => {
        link.addEventListener('click', toggleMenu);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isMenuOpen) toggleMenu();
    });
}

function initAccordions() {
    const accordionItems = document.querySelectorAll('.accordion-item');
    if (!accordionItems.length) return;

    function toggleAccordion(button) {
        const item = button.parentElement;
        const isOpen = item.classList.contains('is-open');
        accordionItems.forEach((other) => {
            other.classList.remove('is-open');
            const btn = other.querySelector('button');
            const panel = other.querySelector('.accordion-content');
            if (btn) btn.setAttribute('aria-expanded', 'false');
            if (panel) panel.setAttribute('aria-hidden', 'true');
        });
        if (!isOpen) {
            item.classList.add('is-open');
            button.setAttribute('aria-expanded', 'true');
            const panel = item.querySelector('.accordion-content');
            if (panel) panel.setAttribute('aria-hidden', 'false');
        }
    }

    accordionItems.forEach((item) => {
        const btn = item.querySelector('button');
        if (btn) btn.addEventListener('click', () => toggleAccordion(btn));
    });
}

function initCarousel() {
    const featuresSection = document.getElementById('features');
    const track = document.getElementById('carousel-track');
    const dotsContainer = document.getElementById('carousel-dots');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (!featuresSection || !track || !dotsContainer || !prevBtn || !nextBtn) return;

    let centerIndex = 0;
    let autoPlay = null;
    let isHovering = false;
    let isTouching = false;
    let isFocused = false;
    let isVisible = false;
    let touchResumeTimeout = null;

    CAROUSEL_ITEMS.forEach((item, index) => {
        const slideId = `carousel-slide-${index}`;
        const card = document.createElement('div');
        card.id = slideId;
        card.addEventListener('click', () => {
            if (centerIndex !== index) goToSlide(index);
        });
        card.className = 'carousel-card bg-white rounded-2xl shadow-sm p-6 flex flex-col items-center text-center select-none';
        card.setAttribute('role', 'tabpanel');
        card.setAttribute('aria-label', item.title);
        card.innerHTML = `
            <div class="w-14 h-14 rounded-2xl ${item.color} flex items-center justify-center text-2xl mb-4 flex-shrink-0">
                <iconify-icon icon="${item.icon}" stroke-width="1.5"></iconify-icon>
            </div>
            <h3 class="text-base sm:text-lg font-semibold text-zinc-800 mb-2">${item.title}</h3>
            <p class="text-sm text-zinc-500 leading-relaxed">${item.desc}</p>
            <div class="mt-auto pt-4">
                <span class="px-3 py-1 rounded-full bg-zinc-50 text-zinc-500 text-[10px] font-bold tracking-widest uppercase border border-zinc-100">${item.label}</span>
            </div>
        `;
        track.appendChild(card);

        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'carousel-dot';
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-controls', slideId);
        dot.setAttribute('aria-label', `Voir slide ${index + 1}: ${item.title}`);
        dot.setAttribute('aria-selected', 'false');
        dot.addEventListener('click', () => goToSlide(index));
        dotsContainer.appendChild(dot);
    });

    const cards = Array.from(track.children);
    const dots = Array.from(dotsContainer.children);

    function updateCarousel() {
        const count = cards.length;
        cards.forEach((card, index) => {
            let offset = index - centerIndex;
            if (offset > count / 2) offset -= count;
            if (offset < -count / 2) offset += count;
            let pos = 'far-right';
            if (offset === 0) pos = 'center';
            else if (offset === -1) pos = 'left';
            else if (offset === 1) pos = 'right';
            else if (offset <= -2) pos = 'far-left';
            card.setAttribute('data-pos', pos);
            card.setAttribute('aria-hidden', offset === 0 ? 'false' : 'true');
        });
        dots.forEach((dot, index) => {
            dot.setAttribute('aria-selected', index === centerIndex ? 'true' : 'false');
        });
    }

    function shouldAutoPlay() {
        return isVisible && !isHovering && !isTouching && !isFocused && !prefersReducedMotion.matches;
    }

    function syncAutoPlay() {
        if (shouldAutoPlay()) {
            if (!autoPlay) {
                autoPlay = setInterval(() => {
                    centerIndex = (centerIndex + 1) % cards.length;
                    updateCarousel();
                }, 4000);
                track.setAttribute('aria-live', 'off');
            }
        } else if (autoPlay) {
            clearInterval(autoPlay);
            autoPlay = null;
            track.setAttribute('aria-live', 'polite');
        }
    }

    function goToSlide(index) {
        centerIndex = (index + cards.length) % cards.length;
        updateCarousel();
        if (autoPlay) {
            clearInterval(autoPlay);
            autoPlay = null;
            syncAutoPlay();
        }
    }

    featuresSection.addEventListener('mouseenter', () => { isHovering = true; syncAutoPlay(); });
    featuresSection.addEventListener('mouseleave', () => { isHovering = false; syncAutoPlay(); });
    featuresSection.addEventListener('focusin', () => { isFocused = true; syncAutoPlay(); });
    featuresSection.addEventListener('focusout', (e) => {
        if (!featuresSection.contains(e.relatedTarget)) {
            isFocused = false;
            syncAutoPlay();
        }
    });

    const carouselObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            isVisible = entry.isIntersecting;
            syncAutoPlay();
        });
    }, { threshold: 0.3 });
    carouselObserver.observe(featuresSection);

    nextBtn.addEventListener('click', () => goToSlide(centerIndex + 1));
    prevBtn.addEventListener('click', () => goToSlide(centerIndex - 1));

    track.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            goToSlide(centerIndex + 1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            goToSlide(centerIndex - 1);
        }
    });

    let touchStartX = 0;
    track.addEventListener('touchstart', (e) => {
        if (touchResumeTimeout) {
            clearTimeout(touchResumeTimeout);
            touchResumeTimeout = null;
        }
        touchStartX = e.changedTouches[0].screenX;
        isTouching = true;
        syncAutoPlay();
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
        const diff = touchStartX - e.changedTouches[0].screenX;
        if (Math.abs(diff) > 50) {
            goToSlide(diff > 0 ? centerIndex + 1 : centerIndex - 1);
        }
        if (touchResumeTimeout) clearTimeout(touchResumeTimeout);
        touchResumeTimeout = setTimeout(() => {
            isTouching = false;
            touchResumeTimeout = null;
            syncAutoPlay();
        }, 3000);
    }, { passive: true });

    prefersReducedMotion.addEventListener('change', syncAutoPlay);
    updateCarousel();
}

function initHeroMockup() {
    const hero = document.getElementById('hero');
    const mockupCard = document.getElementById('mockup-card');
    const mockupText = document.getElementById('mockup-text');
    if (!hero || !mockupCard || !mockupText) return;

    const mockupStudentTabsWrap = document.getElementById('mockup-student-tabs');
    const mockupStudentTabs = Array.from(document.querySelectorAll('[data-mockup-student]'));
    const mockupStudentBadge = document.getElementById('mockup-student-badge');
    const mockupGrade = document.getElementById('mockup-grade');
    const mockupTrend = document.getElementById('mockup-trend');
    const mockupObs = document.getElementById('mockup-obs');
    const mockupContext = document.getElementById('mockup-context');
    const mockupTextStage = document.getElementById('mockup-text-stage');
    const mockupWordCount = document.getElementById('mockup-word-count');
    const mockupToneWrap = document.getElementById('mockup-tone-tabs');
    const mockupToneBtns = Array.from(document.querySelectorAll('[data-mockup-tone]'));
    const mockupRefineBtns = Array.from(document.querySelectorAll('[data-mockup-refine]'));
    const mockupCopyBtn = document.getElementById('mockup-copy-btn');
    const mockupCopyLabel = mockupCopyBtn?.querySelector('.mockup-copy-label');

    let currentStudentId = 'matheo';
    let currentMockupTone = 'bienveillant';
    let currentMockupRefine = null;
    let toneCycleIndex = 0;
    let hasMockupInitialized = false;
    let isMockupHovered = false;
    let isMockupFocused = false;
    let isHeroVisible = false;

    let mockupActiveTimeouts = [];
    let mockupCycleTimeout = null;
    let mockupCopyTimeout = null;

    function clearMockupTimeouts() {
        mockupActiveTimeouts.forEach(clearTimeout);
        mockupActiveTimeouts = [];
        if (mockupCycleTimeout) {
            clearTimeout(mockupCycleTimeout);
            mockupCycleTimeout = null;
        }
    }

    function countMockupWords(text) {
        return text.trim().split(/\s+/).filter(Boolean).length;
    }

    function getActiveMockupText() {
        const student = MOCKUP_STUDENTS[currentStudentId] || MOCKUP_STUDENTS.matheo;
        if (currentMockupRefine && student.refinements?.[currentMockupRefine]?.[currentMockupTone]) {
            return student.refinements[currentMockupRefine][currentMockupTone];
        }
        return student.texts[currentMockupTone] || student.texts.bienveillant;
    }

    function updateSegmentedGroup(wrap, buttons, datasetKey, activeValue, ariaAttr = 'aria-checked') {
        const activeIdx = buttons.findIndex((btn) => btn.dataset[datasetKey] === activeValue);
        if (wrap && activeIdx !== -1) {
            wrap.style.setProperty('--active-idx', String(activeIdx));
        }
        buttons.forEach((btn, idx) => {
            const isActive = idx === activeIdx;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute(ariaAttr, isActive ? 'true' : 'false');
            btn.setAttribute('tabindex', isActive ? '0' : '-1');
        });
    }

    function applyMockupTone(tone) {
        currentMockupTone = tone;
        updateSegmentedGroup(mockupToneWrap, mockupToneBtns, 'mockupTone', tone);
    }

    function applyMockupRefine(refine) {
        currentMockupRefine = refine;
        mockupRefineBtns.forEach((btn) => {
            const isActive = btn.dataset.mockupRefine === refine;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    function renderMockupStudentMeta(studentId) {
        const student = MOCKUP_STUDENTS[studentId] || MOCKUP_STUDENTS.matheo;
        updateSegmentedGroup(mockupStudentTabsWrap, mockupStudentTabs, 'mockupStudent', studentId, 'aria-selected');

        if (mockupStudentBadge) {
            mockupStudentBadge.textContent = student.status;
            mockupStudentBadge.classList.toggle('is-empty', !student.status);
        }
        if (mockupGrade) mockupGrade.innerHTML = `${student.grade}<small>/20</small>`;

        if (mockupTrend) {
            const isUp = student.trendDir === 'up';
            mockupTrend.className = `mockup-metric-trend ${isUp ? 'is-up' : 'is-down'}`;
            const iconName = isUp ? 'ph:arrow-up-right-bold' : 'ph:arrow-down-right-bold';
            mockupTrend.innerHTML = `<iconify-icon icon="${iconName}" width="13"></iconify-icon><span>${student.trend}</span>`;
        }

        if (mockupObs) {
            mockupObs.innerHTML = student.obs.map((item) => {
                const dotClass = OBS_DOT_CLASSES[item.tone] || 'is-pos';
                return `<span class="mockup-metric-obs"><span class="mockup-obs-dot ${dotClass}" aria-hidden="true"></span><span>${item.label}</span></span>`;
            }).join('');
        }

        if (mockupContext) mockupContext.textContent = student.context;
    }

    function renderMockupText(text, stepDelay = 55) {
        if (mockupTextStage) mockupTextStage.classList.remove('is-shimmering');
        if (mockupWordCount) mockupWordCount.textContent = `${countMockupWords(text)} mots`;

        if (stepDelay <= 0 || prefersReducedMotion.matches) {
            mockupText.textContent = text;
            return;
        }

        const words = text.split(' ');
        mockupText.innerHTML = words
            .map((word, index) => `<span class="blur-word" style="transition-delay: ${index * stepDelay}ms">${word}</span>`)
            .join(' ');

        void mockupText.offsetWidth;

        requestAnimationFrame(() => {
            mockupText.querySelectorAll('.blur-word').forEach((span) => span.classList.add('is-visible'));
        });
    }

    function showMockupShimmer() {
        if (mockupTextStage) mockupTextStage.classList.add('is-shimmering');
        mockupText.innerHTML = '<div class="shimmer h-2 w-full rounded mb-3"></div><div class="shimmer h-2 w-11/12 rounded mb-3"></div><div class="shimmer h-2 w-2/3 rounded"></div>';
    }

    function setCopyButtonState(isCopied) {
        if (!mockupCopyBtn) return;
        const wasCopied = mockupCopyBtn.classList.contains('is-copied');
        if (wasCopied === isCopied) return;
        mockupCopyBtn.classList.toggle('is-copied', isCopied);
        if (mockupCopyLabel) {
            mockupCopyLabel.textContent = isCopied ? 'Copié' : 'Copier';
        }
        mockupCopyBtn.setAttribute('aria-label', isCopied ? 'Appréciation copiée' : "Copier l'appréciation");
    }

    function resetCopyButton() {
        if (mockupCopyTimeout) {
            clearTimeout(mockupCopyTimeout);
            mockupCopyTimeout = null;
        }
        setCopyButtonState(false);
    }

    function shouldCycleMockup() {
        return isHeroVisible && !isMockupHovered && !isMockupFocused && !prefersReducedMotion.matches;
    }

    function scheduleNextToneStep(delay = 4200) {
        if (mockupCycleTimeout) clearTimeout(mockupCycleTimeout);
        if (!shouldCycleMockup()) return;
        mockupCycleTimeout = setTimeout(() => {
            if (!shouldCycleMockup()) return;
            const nextTone = TONE_SEQUENCE[toneCycleIndex % TONE_SEQUENCE.length];
            toneCycleIndex = (toneCycleIndex + 1) % TONE_SEQUENCE.length;
            applyMockupRefine(null);
            applyMockupTone(nextTone);
            renderMockupText(getActiveMockupText(), 32);
            scheduleNextToneStep(4200);
        }, delay);
    }

    function initMockupSequence() {
        clearMockupTimeouts();
        hasMockupInitialized = true;
        renderMockupStudentMeta(currentStudentId);
        applyMockupRefine(null);
        applyMockupTone(currentMockupTone);
        if (prefersReducedMotion.matches) {
            renderMockupText(getActiveMockupText(), 0);
            return;
        }
        showMockupShimmer();

        const timer = setTimeout(() => {
            renderMockupText(getActiveMockupText(), 45);
            scheduleNextToneStep(4200);
        }, 650);
        mockupActiveTimeouts.push(timer);
    }

    function selectMockupStudent(studentId) {
        if (!MOCKUP_STUDENTS[studentId]) return;
        clearMockupTimeouts();
        hasMockupInitialized = true;
        currentStudentId = studentId;
        resetCopyButton();
        applyMockupRefine(null);
        renderMockupStudentMeta(studentId);
        renderMockupText(getActiveMockupText(), 24);
        scheduleNextToneStep(8000);
    }

    function selectMockupTone(tone) {
        clearMockupTimeouts();
        hasMockupInitialized = true;
        if (tone === currentMockupTone && !currentMockupRefine) {
            scheduleNextToneStep(8000);
            return;
        }
        resetCopyButton();
        const seqIdx = TONE_SEQUENCE.indexOf(tone);
        if (seqIdx !== -1) toneCycleIndex = (seqIdx + 1) % TONE_SEQUENCE.length;
        applyMockupRefine(null);
        applyMockupTone(tone);
        renderMockupText(getActiveMockupText(), 24);
        scheduleNextToneStep(8000);
    }

    function selectMockupRefine(refine) {
        clearMockupTimeouts();
        hasMockupInitialized = true;
        resetCopyButton();
        const nextRefine = currentMockupRefine === refine ? null : refine;
        applyMockupRefine(nextRefine);
        renderMockupText(getActiveMockupText(), 22);
        scheduleNextToneStep(8000);
    }

    function bindSegmentedGroup(buttons, datasetKey, onSelect) {
        buttons.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                onSelect(btn.dataset[datasetKey]);
            });
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const dir = e.key === 'ArrowRight' ? 1 : -1;
                    const nextIdx = (index + dir + buttons.length) % buttons.length;
                    const nextBtn = buttons[nextIdx];
                    nextBtn.focus();
                    onSelect(nextBtn.dataset[datasetKey]);
                }
            });
        });
    }

    mockupCard.addEventListener('mouseenter', () => {
        isMockupHovered = true;
        if (mockupCycleTimeout) {
            clearTimeout(mockupCycleTimeout);
            mockupCycleTimeout = null;
        }
    });
    mockupCard.addEventListener('mouseleave', () => {
        isMockupHovered = false;
        if (hasMockupInitialized) scheduleNextToneStep(4200);
    });
    mockupCard.addEventListener('focusin', () => {
        isMockupFocused = true;
        if (mockupCycleTimeout) {
            clearTimeout(mockupCycleTimeout);
            mockupCycleTimeout = null;
        }
    });
    mockupCard.addEventListener('focusout', (e) => {
        if (!mockupCard.contains(e.relatedTarget)) {
            isMockupFocused = false;
            if (hasMockupInitialized) scheduleNextToneStep(4200);
        }
    });

    bindSegmentedGroup(mockupStudentTabs, 'mockupStudent', selectMockupStudent);
    bindSegmentedGroup(mockupToneBtns, 'mockupTone', selectMockupTone);

    mockupRefineBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            selectMockupRefine(btn.dataset.mockupRefine);
        });
    });

    if (mockupCopyBtn) {
        mockupCopyBtn.addEventListener('click', () => {
            if (mockupCopyTimeout) clearTimeout(mockupCopyTimeout);
            const textToCopy = getActiveMockupText();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(textToCopy).catch(() => {});
            }
            setCopyButtonState(true);
            mockupCopyTimeout = setTimeout(resetCopyButton, 1600);
        });
    }

    prefersReducedMotion.addEventListener('change', () => {
        if (prefersReducedMotion.matches) {
            clearMockupTimeouts();
            renderMockupText(getActiveMockupText(), 0);
        } else if (hasMockupInitialized) {
            scheduleNextToneStep(4200);
        }
    });

    const heroObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            isHeroVisible = entry.isIntersecting;
            if (entry.isIntersecting) {
                if (!hasMockupInitialized) initMockupSequence();
                else scheduleNextToneStep(4200);
            } else {
                clearMockupTimeouts();
            }
        });
    }, { threshold: 0.2 });
    heroObserver.observe(hero);
}

function initVersionAndSw() {
    fetch(`./version.json?t=${Date.now()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
            const badge = document.getElementById('landingVersionDisplay');
            if (badge && data?.version) {
                badge.textContent = `v${data.version} ·`;
            }
        })
        .catch(() => {});

    if ('serviceWorker' in navigator) {
        let isSwReloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (isSwReloading || document.body.classList.contains('is-navigating-to-app')) return;
            isSwReloading = true;
            window.location.reload();
        });
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((reg) => {
                if (reg.waiting) {
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                reg.addEventListener('updatefound', () => {
                    const installing = reg.installing;
                    if (installing) {
                        installing.addEventListener('statechange', () => {
                            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                                installing.postMessage({ type: 'SKIP_WAITING' });
                            }
                        });
                    }
                });
                reg.update().catch(() => {});
            });
        }).catch(() => {});
    }
}

function initAppTransition() {
    const APP_PATH = './app.html';
    let isPrefetched = false;

    function prefetchApp() {
        if (isPrefetched) return;
        isPrefetched = true;
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = APP_PATH;
        document.head.appendChild(link);
    }

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => prefetchApp(), { timeout: 2500 });
    } else {
        setTimeout(prefetchApp, 2000);
    }

    const appLinks = document.querySelectorAll('a[href*="app.html"]');
    appLinks.forEach((link) => {
        link.addEventListener('mouseenter', prefetchApp, { passive: true, once: true });
        link.addEventListener('focus', prefetchApp, { passive: true, once: true });
        link.addEventListener('touchstart', prefetchApp, { passive: true, once: true });

        link.addEventListener('click', (e) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || link.target === '_blank') {
                return;
            }

            link.classList.add('is-launching');

            try {
                const savedTheme = localStorage.getItem('bulletin_theme');
                const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (savedTheme === 'dark' || (savedTheme === 'system' && prefersDark)) {
                    document.body.classList.add('target-dark');
                    document.documentElement.style.colorScheme = 'dark';
                    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
                        meta.setAttribute('content', '#0c0c0d');
                    });
                }
            } catch (_) {}

            e.preventDefault();
            document.body.classList.add('is-navigating-to-app');

            const targetHref = link.getAttribute('href') || APP_PATH;
            setTimeout(() => {
                window.location.href = targetHref;
            }, 130);
        });
    });

    window.addEventListener('pageshow', () => {
        document.body.classList.remove('is-navigating-to-app', 'target-dark');
        document.documentElement.style.colorScheme = '';
        const lightMeta = document.querySelector('meta[name="theme-color"][media*="light"]');
        if (lightMeta) lightMeta.setAttribute('content', '#f6f6f6');
        appLinks.forEach((link) => link.classList.remove('is-launching'));
    });
}

function bootLanding() {
    initNavbarAndScroll();
    initMobileMenu();
    initAccordions();
    observeOnce('.reveal-on-scroll', 'is-visible', 0.1);
    observeOnce('.workflow-step-icon', 'is-revealed', 0.3);
    initCarousel();
    initHeroMockup();
    initVersionAndSw();
    initAppTransition();
}

export { initHeroMockup };

if (!import.meta.env?.VITEST) {
    bootLanding();
}
