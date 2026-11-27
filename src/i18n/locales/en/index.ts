/** English dictionary – structure checked against the German template. */
import type { DeepMessages, Messages } from '../../core';
import collab from './collab.json';
import common from './common.json';
import dashboard from './dashboard.json';
import grow from './grow.json';
import labels from './labels.json';
import mine from './mine.json';
import shell from './shell.json';

const en: DeepMessages<Messages> = { collab, common, dashboard, grow, labels, mine, shell };
export default en;
