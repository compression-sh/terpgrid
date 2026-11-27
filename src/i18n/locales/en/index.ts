import type { Messages } from '../../core';
import type { DeepMessages } from '../../core';
import common from './common.json';
import labels from './labels.json';
import shell from './shell.json';

const en: DeepMessages<Messages> = { common, labels, shell };
export default en;
