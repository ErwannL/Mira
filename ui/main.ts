import { boot } from './app.js';

void boot(document, window, window.fetch.bind(window));
