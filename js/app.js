/* ============================================
   VISION PLUS - App JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ============ HEADER SCROLL ============
    const header = document.getElementById('main-header');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // ============ MOBILE MENU ============
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mainNav = document.getElementById('main-nav');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            mainNav.classList.toggle('open');
            mobileMenuBtn.classList.toggle('active');
        });

        // Fechar menu ao clicar em um link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                mainNav.classList.remove('open');
                mobileMenuBtn.classList.remove('active');
            });
        });
    }

    // ============ HERO SLIDER ============
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    const prevBtn = document.getElementById('slider-prev');
    const nextBtn = document.getElementById('slider-next');
    let currentSlide = 0;
    let slideInterval;

    function goToSlide(index) {
        slides.forEach(s => s.classList.remove('active'));
        dots.forEach(d => d.classList.remove('active'));
        
        currentSlide = index;
        if (currentSlide >= slides.length) currentSlide = 0;
        if (currentSlide < 0) currentSlide = slides.length - 1;
        
        slides[currentSlide].classList.add('active');
        dots[currentSlide].classList.add('active');
    }

    function nextSlide() {
        goToSlide(currentSlide + 1);
    }

    function prevSlide() {
        goToSlide(currentSlide - 1);
    }

    function startAutoSlide() {
        slideInterval = setInterval(nextSlide, 5000);
    }

    function resetAutoSlide() {
        clearInterval(slideInterval);
        startAutoSlide();
    }

    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => {
            prevSlide();
            resetAutoSlide();
        });

        nextBtn.addEventListener('click', () => {
            nextSlide();
            resetAutoSlide();
        });
    }

    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            goToSlide(parseInt(dot.dataset.slide));
            resetAutoSlide();
        });
    });

    // Iniciar autoplay (somente se houver slides na página)
    if (slides.length) startAutoSlide();

    // ============ SMOOTH SCROLL ============
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                const headerHeight = header.offsetHeight;
                const targetPosition = target.offsetTop - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ============ SCROLL ANIMATIONS ============
    const observerOptions = {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observar elementos para animação de entrada
    document.querySelectorAll('.feature-card, .step-card, .pricing-card, .testimonial-card').forEach(el => {
        el.classList.add('animate-target');
        observer.observe(el);
    });

    // ============ NAV ACTIVE STATE ============
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    window.addEventListener('scroll', () => {
        let current = '';
        const headerHeight = header.offsetHeight;

        sections.forEach(section => {
            const sectionTop = section.offsetTop - headerHeight - 100;
            if (window.scrollY >= sectionTop) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + current) {
                link.classList.add('active');
            }
            if (current === '' || current === 'hero') {
                // Marcar Home como ativo
                if (link.getAttribute('href') === 'index.html') {
                    link.classList.add('active');
                }
            }
        });
    });
});

// ============ VIDEO MODAL ============
window.openVideoModal = function(videoUrl) {
    const modal = document.getElementById('video-modal');
    const iframe = document.getElementById('video-iframe');
    if (modal && iframe) {
        iframe.src = videoUrl;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Evita scroll na página principal
    }
};

window.closeVideoModal = function() {
    const modal = document.getElementById('video-modal');
    const iframe = document.getElementById('video-iframe');
    if (modal && iframe) {
        iframe.src = ''; // Para o vídeo
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
};

// Fechar modal ao clicar fora
document.addEventListener('click', (e) => {
    const modal = document.getElementById('video-modal');
    if (e.target === modal) {
        window.closeVideoModal();
    }
});
