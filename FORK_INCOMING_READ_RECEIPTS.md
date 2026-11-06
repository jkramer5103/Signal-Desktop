# Fork feature: show incoming read receipts while sending is disabled

This fork adds a **desktop-local** option. When it's on, this Desktop shows read
(and viewed) receipts that contacts actually send, even while your normal,
account-wide **Read receipts** setting is off. No outgoing read or viewed
receipts are sent.

## Enabling it

1. Open **Settings → Privacy**.
2. Turn **Read receipts** off. The new row only appears while it's off.
3. Turn on **Show read receipts from others on this device**.

The setting is stored as the local item
`showIncomingReadReceiptsWhenSendingDisabled` and defaults to off, so stock
behavior doesn't change unless you opt in.

## What it does and doesn't do

- **Does:** process incoming `Read` receipts, and `View` receipts on non-story
  messages, from contacts. This covers live receipts, receipts that arrive
  before their message (early receipts), and receipts saved as sync tasks and
  replayed after a restart. All of these go through `shouldDropReceipt` in
  `ts/messageModifiers/MessageReceipts.preload.ts`.
- **Doesn't:** send read or viewed receipts. `ts/util/sendReceipts.preload.ts`
  still checks only `read-receipt-setting`.
- **Doesn't:** change `read-receipt-setting`. It isn't written to the storage
  service `AccountRecord` (no `captureChange`), isn't exported to backups, and
  isn't sent to linked devices.
- **Doesn't:** change story view receipts. Those still follow
  `storyViewReceiptsEnabled`, which falls back to the account setting.
- **Can't:** show reads from contacts who have read receipts turned off. They
  never send a receipt, so there's nothing to show.
- Local unread state, read syncs between your own devices, delivery receipts,
  and disappearing-message timers are unchanged.

## Linked-device caveats

- Your phone and other linked devices keep stock behavior. They drop the same
  receipts, so only this Desktop shows "Read" on your messages.
- Each of your devices receives its own copy of a contact's receipt. Desktop
  gets receipts for messages sent from your phone, too, as long as the sent
  message has synced to Desktop.
- Receipts that arrived and were dropped before you turned this on are gone.
  Older messages won't change to "Read" retroactively.
- If **Read receipts** is turned on (on any device, through account sync), the
  override has nothing left to do. Turning **Read receipts** back off brings the
  override back into effect.
- The setting survives unlinking because it's listed in
  `STORAGE_KEYS_TO_PRESERVE_AFTER_UNLINK`, like other local UI preferences.

## Manual two-account test procedure

Use two **test** Signal accounts, never real private chats. Account A is
linked to this Desktop build. Account B has **Read receipts ON**.

1. On A, turn **Read receipts** off (this syncs to all of A's devices). On
   A's Desktop, leave the new override **off**.
2. From A's Desktop, send B a message. Open it on B. A's Desktop shows
   _Delivered_ only (stock behavior).
3. On A's Desktop, turn the override **on**. Send another message and read it
   on B. A's Desktop now shows _Read_. A's phone still shows _Delivered_.
4. From B, send A a message and open it on A's Desktop. On B, the message
   stays at _Delivered_, which confirms A sent no read receipt.
5. On B, turn **Read receipts** off. Send from A again and read on B. A's
   Desktop stays at _Delivered_.
6. Optional early-receipt check: quit A's Desktop, send from A's phone, read on
   B, then start A's Desktop. The message shows _Read_ after sync.
