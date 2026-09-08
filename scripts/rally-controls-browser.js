// Import through Vite so the harness and game share the same module instances
// after hot updates. The controller is virtual; this does not test hardware.
import { useRace } from '../src/world/games/ember-rally/session';
import { attachControls } from '../src/world/games/ember-rally/controls';
import { thumb, releaseThumbs } from '../src/world/games/ember-rally/touch';

export default async function checkControls() {
  useRace.getState().close();
  await new Promise(resolve => setTimeout(resolve, 100));
  const passed = [];
  const check = (value, label) => { if (!value) throw Error(label); passed.push(label); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const key = (type, key) => window.dispatchEvent(new KeyboardEvent(type, { key, cancelable: true }));
  const surface = document.createElement('div');
  document.body.append(surface);
  const getPads = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
  const matchMedia = window.matchMedia;
  let controls;
  try {
    controls = attachControls(surface);
    key('keydown', 'w');
    await wait(100);
    check(controls.read(20).throttle > 0.5, 'keyboard throttle');
    key('keydown', 'd');
    await wait(100);
    const turning = controls.read(30);
    check(turning.steer > 0.3 && turning.steer < 0.8, 'progressive keyboard steering');
    key('keyup', 'd');
    await wait(100);
    check(controls.read(30).steer < turning.steer * 0.5, 'steering unwinds on release');
    key('keydown', 'Shift');
    check(controls.read(30).boost && !controls.read(30).boost, 'boost fires once per press');
    window.dispatchEvent(new Event('blur'));
    const blurred = controls.read(30);
    check(!blurred.throttle && !blurred.steer && !blurred.boost, 'blur clears all pending controls');
    window.dispatchEvent(new Event('focus'));

    const buttons = Array.from({ length: 17 }, () => ({ value: 0, pressed: false }));
    const pad = { connected: true, mapping: 'standard', axes: [0.5], buttons };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    buttons[7] = { value: 0.7, pressed: true };
    await wait(100);
    const gamepad = controls.read(20);
    check(gamepad.steer > 0.2 && gamepad.steer < 0.5 && gamepad.throttle > 0.3, 'analogue stick and trigger');
    buttons[7] = { value: 0, pressed: false };
    buttons[6] = { value: 0.6, pressed: true };
    await wait(100);
    check(controls.read(20).brake > 0.3, 'controller brake trigger');
    pad.axes[0] = 0.06;
    buttons[6] = { value: 0, pressed: false };
    await wait(100);
    check(Math.abs(controls.read(20).steer) < 0.025, 'stick dead zone');
    controls.detach();
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
    window.matchMedia = query => query === '(pointer: coarse)' ? { matches: true } : matchMedia.call(window, query);
    controls = attachControls(surface);
    await wait(100);
    check(controls.read(20).throttle > 0.5, 'touch automatic throttle');
    thumb.handbrake = true;
    await wait(100);
    const drift = controls.read(20);
    check(drift.handbrake && drift.throttle > 0.7, 'touch drift retains power');
    thumb.handbrake = false;
    thumb.brake = true;
    await wait(100);
    const braked = controls.read(20);
    check(braked.brake > 0.6 && braked.throttle < 0.25, 'touch brake lifts throttle');
    releaseThumbs();
    check(!thumb.brake && !thumb.handbrake && !thumb.boost, 'touch controls clear together');
    return { passed };
  } finally {
    controls?.detach();
    releaseThumbs();
    surface.remove();
    window.matchMedia = matchMedia;
    if (getPads) Object.defineProperty(navigator, 'getGamepads', getPads);
    else delete navigator.getGamepads;
    window.dispatchEvent(new Event('focus'));
  }
}
