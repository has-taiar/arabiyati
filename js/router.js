// router.js — simple screen manager

const SCREENS = {};

function registerScreen(name, mountFn) {
  SCREENS[name] = mountFn;
}

let _currentScreen = null;

function showScreen(name, params = {}) {
  const app = document.getElementById('app');

  // Slide-out current
  if (_currentScreen) {
    app.classList.add('slide-out');
  }

  setTimeout(() => {
    app.innerHTML = '';
    app.classList.remove('slide-out', 'slide-in');

    if (SCREENS[name]) {
      SCREENS[name](app, params);
    } else {
      app.innerHTML = `<p>Screen "${name}" not found.</p>`;
    }

    app.classList.add('slide-in');
    _currentScreen = name;
  }, _currentScreen ? 200 : 0);
}
