/**
 * app.js — controlador de painéis horizontais com transições cinematográficas
 */
(function () {
  'use strict';

  var SECTIONS        = ['hero', 'regra', 'tres-ps', 'video', 'debrief', 'fechamento'];
  var SCROLL_DURATION = 950;
  var LOCK_EXTRA      = 300;
  var REVEAL_STEP     = 80;

  var stage         = document.getElementById('horizontal-stage');
  var progressFill  = document.querySelector('.progress-bar__fill');
  var progressBar   = document.querySelector('.progress-bar');
  var panelCurrent  = document.getElementById('panel-current');
  var btnPresent    = document.getElementById('btn-presentation');
  var transitionScrim = document.querySelector('.transition-scrim');
  var navLinks      = document.querySelectorAll(
    '.site-nav a[data-section], .site-header__brand[data-section], a.btn[data-section]'
  );
  var navDots = document.querySelectorAll('.nav-rail__dot[data-section]');
  var panels  = Array.prototype.slice.call(document.querySelectorAll('.panel'));

  var parallaxLayers = {
    grid    : document.querySelector('.layer-grid'),
    tank    : document.querySelector('.layer-tank'),
    risk    : document.querySelector('.layer-risk-line'),
    warning : document.querySelector('.layer-warning'),
    noise   : document.querySelector('.layer-noise')
  };

  var currentIndex    = 0;
  var isTransitioning = false;
  var scrollTimer     = null;
  var reducedMotion   = window.matchMedia('(prefers-reduced-motion: reduce)');

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function easeOutExpo(t) {
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function updateProgressBar(index) {
    var pct = panels.length > 1
      ? Math.round((index / (panels.length - 1)) * 100)
      : 0;
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressBar)  progressBar.setAttribute('aria-valuenow', pct);
  }

  function updateNavUI(index) {
    var sectionId = SECTIONS[index] || '';

    navLinks.forEach(function (link) {
      var active = link.getAttribute('data-section') === sectionId;
      link.classList.toggle('is-active', active);
      active
        ? link.setAttribute('aria-current', 'true')
        : link.removeAttribute('aria-current');
    });

    navDots.forEach(function (dot, i) {
      var active = i === index;
      dot.classList.toggle('is-active', active);
      active
        ? dot.setAttribute('aria-current', 'true')
        : dot.removeAttribute('aria-current');
    });

    if (panelCurrent) panelCurrent.textContent = pad(index + 1);
    updateProgressBar(index);
  }

  function applyPanelClasses(activeIndex) {
    panels.forEach(function (panel, i) {
      panel.classList.remove('is-active', 'is-prev', 'is-next', 'is-entering', 'is-leaving');
      if      (i === activeIndex)     panel.classList.add('is-active');
      else if (i === activeIndex - 1) panel.classList.add('is-prev');
      else if (i === activeIndex + 1) panel.classList.add('is-next');
    });
  }

  function triggerReveal(panel) {
    if (!panel || reducedMotion.matches) return;
    panel.querySelectorAll('[data-reveal]').forEach(function (el) {
      var step = parseInt(el.getAttribute('data-reveal') || '0', 10);
      el.style.transitionDelay = (step * REVEAL_STEP) + 'ms';
    });
  }

  function resetReveal(panel) {
    if (!panel) return;
    panel.querySelectorAll('[data-reveal]').forEach(function (el) {
      el.style.transitionDelay = '';
    });
  }

  function setScrim(active) {
    if (!transitionScrim) return;
    transitionScrim.classList.toggle('is-active', active);
  }

  function updateParallax(progress) {
    if (reducedMotion.matches) return;
    var p = clamp(progress, 0, 1);

    if (parallaxLayers.grid) {
      parallaxLayers.grid.style.transform = 'translateX(' + (-p * 150) + 'px)';
    }
    if (parallaxLayers.tank) {
      parallaxLayers.tank.style.transform =
        'translateX(' + (-p * 240) + 'px) translateY(' + (p * 28) + 'px) scale(' + (1 - p * 0.06) + ')';
      parallaxLayers.tank.style.opacity = String(Math.max(0, 0.14 - p * 0.08));
    }
    if (parallaxLayers.risk) {
      parallaxLayers.risk.style.transform = 'translateX(' + (-p * 320) + 'px)';
      parallaxLayers.risk.style.opacity   = String(0.28 + p * 0.2);
    }
    if (parallaxLayers.warning) {
      parallaxLayers.warning.style.transform =
        'translateX(' + (-p * 100) + 'px) rotate(' + (p * 20) + 'deg)';
      parallaxLayers.warning.style.opacity = String(0.05 + p * 0.15);
    }
    if (parallaxLayers.noise) {
      parallaxLayers.noise.style.transform = 'translateX(' + (-p * 55) + 'px)';
    }
  }

  function goToPanel(targetIndex, opts) {
    opts = opts || {};
    targetIndex = clamp(targetIndex, 0, panels.length - 1);
    if (!panels[targetIndex]) return;
    if (targetIndex === currentIndex && !opts.force) return;
    if (isTransitioning && !opts.force) return;

    var fromIndex = currentIndex;
    currentIndex  = targetIndex;
    isTransitioning = true;

    var fromPanel = panels[fromIndex];
    var toPanel   = panels[targetIndex];

    fromPanel.classList.add('is-leaving');
    toPanel.classList.add('is-entering');
    if (stage) stage.classList.add('stage-is-transitioning');
    setScrim(true);

    triggerReveal(toPanel);
    applyPanelClasses(targetIndex);
    updateNavUI(targetIndex);

    if (reducedMotion.matches) {
      if (stage) stage.scrollLeft = toPanel.offsetLeft;
      finishTransition(fromPanel, toPanel);
      return;
    }

    var fromScroll = stage ? stage.scrollLeft : 0;
    var toScroll   = toPanel.offsetLeft;
    var startTime  = null;

    function step(ts) {
      if (!startTime) startTime = ts;
      var t = Math.min((ts - startTime) / SCROLL_DURATION, 1);
      if (stage) {
        stage.scrollLeft = fromScroll + (toScroll - fromScroll) * easeOutExpo(t);
        updateParallax(stage.scrollLeft / Math.max(1, stage.scrollWidth - stage.clientWidth));
      }
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        setTimeout(function () {
          finishTransition(fromPanel, toPanel);
        }, LOCK_EXTRA);
      }
    }

    requestAnimationFrame(step);
  }

  function finishTransition(fromPanel, toPanel) {
    fromPanel.classList.remove('is-leaving');
    toPanel.classList.remove('is-entering');
    if (stage) stage.classList.remove('stage-is-transitioning');
    setScrim(false);
    resetReveal(fromPanel);
    isTransitioning = false;
  }

  function detectActiveFromScroll() {
    if (!stage || isTransitioning) return;
    var center = stage.scrollLeft + stage.clientWidth * 0.5;
    var closest = 0;
    var minDist = Infinity;
    panels.forEach(function (p, i) {
      var dist = Math.abs(p.offsetLeft + p.clientWidth * 0.5 - center);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    if (closest !== currentIndex) {
      currentIndex = closest;
      triggerReveal(panels[closest]);
      applyPanelClasses(closest);
      updateNavUI(closest);
    }
  }

  function shouldIgnoreWheel(target) {
    return false;
  }

  function handleWheel(e) {
    if (!stage || shouldIgnoreWheel(e.target)) return;
    e.preventDefault();
    var delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(delta) < 2) return;
    goToPanel(delta > 0 ? currentIndex + 1 : currentIndex - 1);
  }

  function handleScroll() {
    if (stage) {
      updateParallax(stage.scrollLeft / Math.max(1, stage.scrollWidth - stage.clientWidth));
    }
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(detectActiveFromScroll, 120);
  }

  function handleKeyboard(e) {
    var tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

    if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      togglePresentation();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goToPanel(currentIndex + 1); return; }
    if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   { e.preventDefault(); goToPanel(currentIndex - 1); return; }
    if (e.key === 'Home') { e.preventDefault(); goToPanel(0); return; }
    if (e.key === 'End')  { e.preventDefault(); goToPanel(panels.length - 1); return; }
  }

  function togglePresentation() {
    document.body.classList.toggle('is-presentation');
    var on = document.body.classList.contains('is-presentation');
    if (btnPresent) {
      btnPresent.setAttribute('aria-pressed', on ? 'true' : 'false');
      btnPresent.title = on ? 'Sair do modo apresentação (P)' : 'Modo apresentação (P)';
    }
  }

  function initMagneticButtons() {
    if (reducedMotion.matches) return;

    document.querySelectorAll('.magnetic-btn').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var rect = btn.getBoundingClientRect();
        var x = e.clientX - rect.left - rect.width / 2;
        var y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = 'translate(' + (x * 0.12) + 'px, ' + (y * 0.18) + 'px)';
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.transform = '';
      });
    });
  }

  function initNavLinks() {
    var selector = '.site-nav a[data-section], .site-header__brand[data-section], ' +
                   '.nav-rail__dot[data-section], a.btn[data-section]';
    document.querySelectorAll(selector).forEach(function (el) {
      el.addEventListener('click', function (e) {
        var id = el.getAttribute('data-section');
        if (!id) return;
        e.preventDefault();
        var idx = SECTIONS.indexOf(id);
        if (idx >= 0) goToPanel(idx);
      });
    });
  }

  function initStage() {
    if (!stage) return;
    stage.addEventListener('scroll', handleScroll, { passive: true });
    stage.addEventListener('wheel',  handleWheel,  { passive: false });
    window.addEventListener('resize', function () {
      if (!isTransitioning && stage && panels[currentIndex]) {
        stage.scrollLeft = panels[currentIndex].offsetLeft;
        updateParallax(stage.scrollLeft / Math.max(1, stage.scrollWidth - stage.clientWidth));
      }
    });
    reducedMotion.addEventListener('change', function () {
      if (reducedMotion.matches) {
        Object.keys(parallaxLayers).forEach(function (key) {
          var layer = parallaxLayers[key];
          if (layer) { layer.style.transform = ''; layer.style.opacity = ''; }
        });
      }
    });
  }

  function init() {
    document.documentElement.classList.add('js-ready');

    initStage();
    initNavLinks();
    initMagneticButtons();

    if (btnPresent) btnPresent.addEventListener('click', togglePresentation);
    document.addEventListener('keydown', handleKeyboard);

    requestAnimationFrame(function () {
      triggerReveal(panels[0]);
      applyPanelClasses(0);
      updateNavUI(0);
      if (stage) stage.scrollLeft = 0;
      isTransitioning = false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
