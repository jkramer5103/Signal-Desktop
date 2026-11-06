// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import sinon from 'sinon';
import { v4 as uuid } from 'uuid';

import type { LoggerType } from '../../types/Logging.std.ts';
import { ReceiptType } from '../../types/Receipt.std.ts';
import { sendReceipts } from '../../util/sendReceipts.preload.ts';
import { messageSender } from '../../textsecure/SendMessage.preload.ts';
import { itemStorage } from '../../textsecure/Storage.preload.ts';
import { generateAci } from '../../test-helpers/serviceIdUtils.std.ts';

describe('sendReceipts', () => {
  let sandbox: sinon.SinonSandbox;
  let infoLines: Array<string>;
  let log: LoggerType;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    infoLines = [];
    const noop = () => undefined;
    log = {
      fatal: noop,
      error: noop,
      warn: noop,
      info: (...args: Array<unknown>) => {
        infoLines.push(args.join(' '));
      },
      debug: noop,
      trace: noop,
      child: () => log,
    };
  });

  afterEach(async () => {
    sandbox.restore();
    await itemStorage.remove('showIncomingReadReceiptsWhenSendingDisabled');
    await itemStorage.remove('read-receipt-setting');
  });

  function makeReceipt() {
    return {
      messageId: uuid(),
      conversationId: uuid(),
      senderAci: generateAci(),
      timestamp: Date.now(),
      isDirectConversation: true,
    };
  }

  [ReceiptType.Read, ReceiptType.Viewed].forEach(type => {
    it(`never sends ${type} when read receipts are off, even with the incoming-receipt override on`, async () => {
      await itemStorage.put('read-receipt-setting', false);
      await itemStorage.put(
        'showIncomingReadReceiptsWhenSendingDisabled',
        true
      );

      const sendRead = sandbox.stub(messageSender, 'sendReadReceipt');
      const sendViewed = sandbox.stub(messageSender, 'sendViewedReceipt');

      await sendReceipts({ log, receipts: [makeReceipt()], type });

      sinon.assert.notCalled(sendRead);
      sinon.assert.notCalled(sendViewed);
      assert.include(
        infoLines,
        'requires user setting. Not sending these receipts'
      );
    });
  });

  it('still passes the setting gate when read receipts are on (control)', async () => {
    await itemStorage.put('read-receipt-setting', true);

    await sendReceipts({ log, receipts: [], type: ReceiptType.Read });

    assert.notInclude(
      infoLines,
      'requires user setting. Not sending these receipts'
    );
    assert.include(
      infoLines,
      `Starting receipt send of type ${ReceiptType.Read}`
    );
  });
});
