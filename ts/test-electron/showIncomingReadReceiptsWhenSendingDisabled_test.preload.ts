// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { DataWriter } from '../sql/Client.preload.ts';
import { toAccountRecord } from '../services/storageRecordOps.preload.ts';
import { itemStorage } from '../textsecure/Storage.preload.ts';
import {
  STORAGE_KEYS_TO_PRESERVE_AFTER_UNLINK,
  STORAGE_KEYS_TO_PRESERVE_WHEN_PRIMARY,
} from '../types/StorageKeys.std.ts';
import {
  areStoryViewReceiptsEnabled,
  getReadReceiptSetting,
  shouldProcessIncomingReadReceipts,
} from '../util/Settings.preload.ts';
import { generateAci } from '../test-helpers/serviceIdUtils.std.ts';

const KEY = 'showIncomingReadReceiptsWhenSendingDisabled';

describe('showIncomingReadReceiptsWhenSendingDisabled', () => {
  beforeEach(async () => {
    const ourAci = generateAci();
    await itemStorage.put('uuid_id', `${ourAci}.1`);
    await window.ConversationController.load();
    window.ConversationController.getOrCreate(ourAci, 'private');
  });

  afterEach(async () => {
    await DataWriter.removeAll();
    await itemStorage.fetch();
  });

  it('defaults to off, preserving stock behavior', async () => {
    await itemStorage.put('read-receipt-setting', false);
    await itemStorage.remove(KEY);

    assert.isFalse(shouldProcessIncomingReadReceipts());
  });

  it('enables processing incoming receipts without enabling read receipts', async () => {
    await itemStorage.put('read-receipt-setting', false);
    await itemStorage.remove('storyViewReceiptsEnabled');
    await itemStorage.put(KEY, true);

    assert.isTrue(shouldProcessIncomingReadReceipts());
    assert.isFalse(getReadReceiptSetting());
    // Story view receipt policy (which falls back to the account setting)
    // is not affected by the local override.
    assert.isFalse(areStoryViewReceiptsEnabled());
  });

  it('is not written to the storage service account record', async () => {
    await itemStorage.put('read-receipt-setting', false);
    await itemStorage.put(KEY, true);

    const ourConversation =
      window.ConversationController.getOurConversationOrThrow();
    const signalConversation = window.ConversationController.getOrCreate(
      generateAci(),
      'private'
    );

    const record = toAccountRecord({
      ourConversation,
      signalConversation,
      notificationProfileSyncDisabled: false,
    });

    assert.isFalse(record.readReceipts, 'readReceipts synced as off');
    assert.notInclude(
      JSON.stringify(Object.keys(record)),
      'IncomingReadReceipts',
      'no account record field for the local override'
    );
  });

  it('is a desktop-local key, not primary-device account data', () => {
    assert.include(
      STORAGE_KEYS_TO_PRESERVE_AFTER_UNLINK as ReadonlyArray<string>,
      KEY
    );
    assert.notInclude(
      STORAGE_KEYS_TO_PRESERVE_WHEN_PRIMARY as ReadonlyArray<string>,
      KEY
    );
  });
});
