/** English dictionary – structure checked against the German template. */
import type { DeepMessages, Messages } from '../../core';
import account from './account.json';
import collab from './collab.json';
import common from './common.json';
import dashboard from './dashboard.json';
import discover from './discover.json';
import grow from './grow.json';
import lab from './lab.json';
import labels from './labels.json';
import mine from './mine.json';
import photos from './photos.json';
import shell from './shell.json';
import tools from './tools.json';

const en: DeepMessages<Messages> = { account, collab, common, dashboard, discover, grow, lab, labels, mine, photos, shell, tools };
export default en;
