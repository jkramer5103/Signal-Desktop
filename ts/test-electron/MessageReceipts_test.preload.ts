// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { v4 as uuid } from 'uuid';
import { assert } from 'chai';

import type { AciString } from '../types/ServiceId.std.ts';
import type { MessageAttributesType } from '../model-types.std.ts';
import { DataReader, DataWriter } from '../sql/Client.preload.ts';
import { SendStatus } from '../messages/MessageSendState.std.ts';
import type {
  MessageReceiptAttributesType,
  MessageReceiptType,
} from '../messageModifiers/MessageReceipts.preload.ts';
import {
  forMessage,
  onReceipt,
  messageReceiptTypeSchema,
} from '../messageModifiers/MessageReceipts.preload.ts';
import { ReadStatus } from '../messages/MessageReadStatus.std.ts';
import { itemStorage } from '../textsecure/Storage.preload.ts';
import { generateAci } from '../test-helpers/serviceIdUtils.std.ts';

describe('MessageReceipts', () => {
  let ourAci: AciString;

  beforeEach(async () => {
    ourAci = generateAci();
    await itemStorage.put('uuid_id', `${ourAci}.1`);
    await itemStorage.put('read-receipt-setting', true);
    await window.ConversationController.load();
  });

  afterEach(async () => {
    await DataWriter.removeAll();
    await itemStorage.fetch();
  });

  function generateReceipt(
    sourceConversationId: string,
    messageSentAt: number,
    type: MessageReceiptType
  ): MessageReceiptAttributesType {
    return {
      envelopeId: uuid(),
      syncTaskId: uuid(),
      receiptSync: {
        messageSentAt,
        receiptTimestamp: 1,
        sourceConversationId,
        sourceDevice: 1,
        sourceServiceId: generateAci(),
        type,
        wasSentEncrypted: true,
      },
    };
  }
  it('processes all receipts in a batch', async () => {
    const id = uuid();
    const sentAt = Date.now();

    const messageAttributes: MessageAttributesType = {
      conversationId: uuid(),
      id,
      received_at: 1,
      sent_at: sentAt,
      timestamp: sentAt,
      type: 'outgoing',
      sendStateByConversationId: {
        aaaa: {
          status: SendStatus.Sent,
          updatedAt: Date.now(),
        },
        bbbb: {
          status: SendStatus.Sent,
          updatedAt: Date.now(),
        },
        cccc: {
          status: SendStatus.Sent,
          updatedAt: Date.now(),
        },
        dddd: {
          status: SendStatus.Sent,
          updatedAt: Date.now(),
        },
      },
    };

    await window.MessageCache.saveMessage(messageAttributes, {
      forceSave: true,
    });

    await Promise.all([
      onReceipt(
        generateReceipt('aaaa', sentAt, messageReceiptTypeSchema.enum.Delivery)
      ),
      onReceipt(
        generateReceipt('bbbb', sentAt, messageReceiptTypeSchema.enum.Delivery)
      ),
      onReceipt(
        generateReceipt('cccc', sentAt, messageReceiptTypeSchema.enum.Read)
      ),
      onReceipt(
        generateReceipt('aaaa', sentAt, messageReceiptTypeSchema.enum.Read)
      ),
    ]);

    const messageFromDatabase = await DataReader.getMessageById(id);
    const savedSendState = messageFromDatabase?.sendStateByConversationId;

    assert.equal(savedSendState?.aaaa?.status, SendStatus.Read, 'aaaa');
    assert.equal(savedSendState?.bbbb?.status, SendStatus.Delivered, 'bbbb');
    assert.equal(savedSendState?.cccc?.status, SendStatus.Read, 'cccc');
    assert.equal(savedSendState?.dddd?.status, SendStatus.Sent, 'dddd');
  });

  it('updates sendStateByConversationId for edits', async () => {
    const id = uuid();
    const sentAt = Date.now();
    const editedSentAt = sentAt + 1000;
    const defaultSendState = {
      aaaa: {
        status: SendStatus.Sent,
        updatedAt: Date.now(),
      },
      bbbb: {
        status: SendStatus.Sent,
        updatedAt: Date.now(),
      },
      cccc: {
        status: SendStatus.Sent,
        updatedAt: Date.now(),
      },
      dddd: {
        status: SendStatus.Sent,
        updatedAt: Date.now(),
      },
    };

    const messageAttributes: MessageAttributesType = {
      conversationId: uuid(),
      id,
      received_at: 1,
      sent_at: sentAt,
      timestamp: sentAt,
      editMessageTimestamp: editedSentAt,
      type: 'outgoing',
      sendStateByConversationId: defaultSendState,
      editHistory: [
        {
          sendStateByConversationId: defaultSendState,
          timestamp: editedSentAt,
          received_at: 2,
          received_at_ms: Date.now(),
        },
        {
          sendStateByConversationId: defaultSendState,
          timestamp: sentAt,
          received_at: 1,
          received_at_ms: Date.now(),
        },
      ],
    };

    await window.MessageCache.saveMessage(messageAttributes, {
      forceSave: true,
    });
    await DataWriter.saveEditedMessage(messageAttributes, ourAci, {
      conversationId: messageAttributes.conversationId,
      messageId: messageAttributes.id,
      readStatus: ReadStatus.Read,
      sentAt: editedSentAt,
    });

    await Promise.all([
      // send receipts for original message
      onReceipt(
        generateReceipt('aaaa', sentAt, messageReceiptTypeSchema.enum.Delivery)
      ),
      onReceipt(
        generateReceipt('bbbb', sentAt, messageReceiptTypeSchema.enum.Delivery)
      ),
      onReceipt(
        generateReceipt('cccc', sentAt, messageReceiptTypeSchema.enum.Read)
      ),
      onReceipt(
        generateReceipt('aaaa', sentAt, messageReceiptTypeSchema.enum.Read)
      ),

      // and send receipts for edited message
      onReceipt(
        generateReceipt(
          'aaaa',
          editedSentAt,
          messageReceiptTypeSchema.enum.Delivery
        )
      ),
      onReceipt(
        generateReceipt(
          'bbbb',
          editedSentAt,
          messageReceiptTypeSchema.enum.Delivery
        )
      ),
      onReceipt(
        generateReceipt(
          'cccc',
          editedSentAt,
          messageReceiptTypeSchema.enum.Read
        )
      ),
      onReceipt(
        generateReceipt(
          'bbbb',
          editedSentAt,
          messageReceiptTypeSchema.enum.Read
        )
      ),
    ]);

    const messageFromDatabase = await DataReader.getMessageById(id);
    const rootSendState = messageFromDatabase?.sendStateByConversationId;

    assert.deepEqual(
      rootSendState,
      messageFromDatabase?.editHistory?.[0]?.sendStateByConversationId,
      'edit history version should match root version'
    );
    assert.equal(rootSendState?.aaaa?.status, SendStatus.Delivered, 'aaaa');
    assert.equal(rootSendState?.bbbb?.status, SendStatus.Read, 'bbbb');
    assert.equal(rootSendState?.cccc?.status, SendStatus.Read, 'cccc');
    assert.equal(rootSendState?.dddd?.status, SendStatus.Sent, 'dddd');

    const originalMessageSendState =
      messageFromDatabase?.editHistory?.[1]?.sendStateByConversationId;

    assert.equal(
      originalMessageSendState?.aaaa?.status,
      SendStatus.Read,
      'original-aaaa'
    );
    assert.equal(
      originalMessageSendState?.bbbb?.status,
      SendStatus.Delivered,
      'original-bbbb'
    );
    assert.equal(
      originalMessageSendState?.cccc?.status,
      SendStatus.Read,
      'original-cccc'
    );
    assert.equal(
      originalMessageSendState?.dddd?.status,
      SendStatus.Sent,
      'original-dddd'
    );
  });

  describe('when the account-wide read receipt setting is disabled', () => {
    beforeEach(async () => {
      await itemStorage.put('read-receipt-setting', false);
      // Needed when a receipt arrives before its message (early receipts)
      window.ConversationController.getOrCreate(ourAci, 'private');
    });

    function makeOutgoingMessage(
      recipients: ReadonlyArray<string>
    ): MessageAttributesType {
      const sentAt = Date.now();
      return {
        conversationId: uuid(),
        id: uuid(),
        received_at: 1,
        sent_at: sentAt,
        timestamp: sentAt,
        type: 'outgoing',
        sendStateByConversationId: Object.fromEntries(
          recipients.map(recipient => [
            recipient,
            { status: SendStatus.Sent, updatedAt: Date.now() },
          ])
        ),
      };
    }

    async function applyReceipts(
      message: MessageAttributesType,
      receipts: ReadonlyArray<[string, MessageReceiptType]>
    ) {
      await window.MessageCache.saveMessage(message, { forceSave: true });
      await Promise.all(
        receipts.map(([conversationId, type]) =>
          onReceipt(generateReceipt(conversationId, message.sent_at, type))
        )
      );
      const fromDatabase = await DataReader.getMessageById(message.id);
      return fromDatabase?.sendStateByConversationId;
    }

    it('drops incoming read/view receipts by default (stock behavior)', async () => {
      const sendState = await applyReceipts(
        makeOutgoingMessage(['aaaa', 'bbbb', 'cccc']),
        [
          ['aaaa', messageReceiptTypeSchema.enum.Delivery],
          ['bbbb', messageReceiptTypeSchema.enum.Read],
          ['cccc', messageReceiptTypeSchema.enum.View],
        ]
      );

      assert.equal(sendState?.aaaa?.status, SendStatus.Delivered, 'aaaa');
      assert.equal(sendState?.bbbb?.status, SendStatus.Sent, 'bbbb');
      assert.equal(sendState?.cccc?.status, SendStatus.Sent, 'cccc');
    });

    it('applies incoming read/view receipts with the local override on', async () => {
      await itemStorage.put(
        'showIncomingReadReceiptsWhenSendingDisabled',
        true
      );

      const sendState = await applyReceipts(
        makeOutgoingMessage(['aaaa', 'bbbb', 'cccc', 'dddd']),
        [
          ['aaaa', messageReceiptTypeSchema.enum.Delivery],
          ['bbbb', messageReceiptTypeSchema.enum.Read],
          ['cccc', messageReceiptTypeSchema.enum.View],
        ]
      );

      assert.equal(sendState?.aaaa?.status, SendStatus.Delivered, 'aaaa');
      assert.equal(sendState?.bbbb?.status, SendStatus.Read, 'bbbb');
      assert.equal(sendState?.cccc?.status, SendStatus.Viewed, 'cccc');
      // A contact that sends no receipt is never marked read
      assert.equal(sendState?.dddd?.status, SendStatus.Sent, 'dddd');

      // The override must never flip the account-wide setting
      assert.isFalse(itemStorage.get('read-receipt-setting'));
    });

    it('leaves story view receipt policy unchanged by the local override', async () => {
      await itemStorage.put(
        'showIncomingReadReceiptsWhenSendingDisabled',
        true
      );
      await itemStorage.put('storyViewReceiptsEnabled', false);

      const sentAt = Date.now();
      const story: MessageAttributesType = {
        conversationId: uuid(),
        id: uuid(),
        received_at: 1,
        sent_at: sentAt,
        timestamp: sentAt,
        type: 'story',
        sourceServiceId: ourAci,
        sendStateByConversationId: {
          aaaa: { status: SendStatus.Delivered, updatedAt: Date.now() },
        },
      };

      const sendState = await applyReceipts(story, [
        ['aaaa', messageReceiptTypeSchema.enum.View],
      ]);

      assert.equal(sendState?.aaaa?.status, SendStatus.Delivered, 'aaaa');
    });

    describe('early receipts (receipt arrives before its message)', () => {
      async function getEarlyReceiptTypes(): Promise<Array<string>> {
        const message = makeOutgoingMessage(['aaaa']);
        await Promise.all([
          onReceipt(
            generateReceipt(
              'aaaa',
              message.sent_at,
              messageReceiptTypeSchema.enum.Delivery
            )
          ),
          onReceipt(
            generateReceipt(
              'aaaa',
              message.sent_at,
              messageReceiptTypeSchema.enum.Read
            )
          ),
        ]);
        const receipts = await forMessage(message);
        return receipts.map(({ receiptSync }) => receiptSync.type).sort();
      }

      it('drops early read receipts by default', async () => {
        assert.deepEqual(await getEarlyReceiptTypes(), ['Delivery']);
      });

      it('keeps early read receipts with the local override on', async () => {
        await itemStorage.put(
          'showIncomingReadReceiptsWhenSendingDisabled',
          true
        );
        assert.deepEqual(await getEarlyReceiptTypes(), ['Delivery', 'Read']);
      });
    });
  });
});
