// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
import { itemStorage } from '../textsecure/Storage.preload.ts';

export function getLinkPreviewSetting(): boolean {
  return itemStorage.get('linkPreviews', false);
}

export function getTypingIndicatorSetting(): boolean {
  return itemStorage.get('typingIndicators', false);
}
export function getReadReceiptSetting(): boolean {
  return itemStorage.get('read-receipt-setting', false);
}

/**
 * Desktop-local opt-in. Only affects whether incoming read/viewed receipts
 * are processed while the account-wide read receipt setting is disabled; it
 * never causes outgoing read receipts to be sent.
 */
function getShowIncomingReadReceiptsWhenSendingDisabledSetting(): boolean {
  return itemStorage.get('showIncomingReadReceiptsWhenSendingDisabled', false);
}

/**
 * Whether incoming (non-story) read and viewed receipts from contacts should
 * be applied to our outgoing messages.
 */
export function shouldProcessIncomingReadReceipts(): boolean {
  return (
    getReadReceiptSetting() ||
    getShowIncomingReadReceiptsWhenSendingDisabledSetting()
  );
}

export function getSealedSenderIndicatorSetting(): boolean {
  return itemStorage.get('sealedSenderIndicators', false);
}

export function areStoryViewReceiptsEnabled(): boolean {
  return (
    itemStorage.get('storyViewReceiptsEnabled') ??
    itemStorage.get('read-receipt-setting') ??
    false
  );
}
