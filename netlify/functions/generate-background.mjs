// Background function: Netlify antwoordt direct met 202 en laat deze tot 15 minuten doorlopen.
import { netlifyHandler } from '../lib/adapter.mjs';
export default netlifyHandler('start', { wait: true });
