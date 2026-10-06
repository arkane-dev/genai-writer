// Frameless window controls. No-ops in a browser.
import * as Rt from '$lib/wailsjs/runtime/runtime';
import { inWails } from './env';

export const win = {
	minimise: () => inWails && Rt.WindowMinimise(),
	toggleMaximise: () => inWails && Rt.WindowToggleMaximise(),
	quit: () => inWails && Rt.Quit()
};
