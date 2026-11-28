/** English dictionary – structure checked against the German template. */
import type { DeepMessages, Messages } from '../../core';
import academy from './academy.json';
import account from './account.json';
import admin from './admin.json';
import collab from './collab.json';
import common from './common.json';
import dashboard from './dashboard.json';
import data from './data.json';
import discover from './discover.json';
import grow from './grow.json';
import lab from './lab.json';
import labels from './labels.json';
import mine from './mine.json';
import photos from './photos.json';
import settings from './settings.json';
import shell from './shell.json';
import tools from './tools.json';

const en: DeepMessages<Messages> = { academy, account, admin, collab, common, dashboard, data, discover, grow, lab, labels, mine, photos, settings, shell, tools };
export default en;
