# WhatsApp Membership-Card Template — Creation Guide (whatsbizapi.com)

The MIS "🚀 Send via Official API" button sends an **approved template message** with the
card image as the header. WhatsApp only lets a business message a customer first via an
approved template, so this template must exist **and be approved** before the button works.

> **Important:** every branch has its **own WhatsApp number** (its own API key), and each
> number has its own template list. You must create + approve this template **once per
> branch number** in that number's whatsbizapi.com panel. Use the **same name and language**
> on every number so one setting works everywhere.

---

## 1. Create the template

In the whatsbizapi.com panel for that branch's number, open **Templates ▸ New Template**
(it submits to Meta for approval) and fill:

| Setting | Value |
|---|---|
| Name | `membership_card` (lowercase, underscores only — must match exactly) |
| Category | **Utility** (approves faster & cheaper than Marketing) |
| Language | **English** → code `en` |
| Header | **Image** (upload any sample card PNG — the real card is attached at send time) |
| Body | Copy the text below |
| Footer (optional) | `Nakoda Diagnostics & Research Center` |

### Body text (paste exactly — 6 variables)

```
Greetings from NAKODA DIAGNOSTICS AND RESEARCH CENTER - {{1}} 🙏

Dear {{2}}, your membership card is ready!

Membership Number: {{3}}
Card Type: {{4}}
Valid up to: {{5}}

Your card image is attached above — please save it.

Please save {{6}} as *Nakoda Lab* in your contacts for any emergency.
```

When the form asks for **sample values** for the variables, give:

| Var | Meaning (what the MIS sends) | Sample |
|---|---|---|
| {{1}} | Branch name | Navsari |
| {{2}} | Member name | RAMESH PATEL |
| {{3}} | Card number | NAK-NAV1-00123 |
| {{4}} | Card type | PLATINUM |
| {{5}} | Valid till | 14/07/2027 |
| {{6}} | Branch contact number | 9998144001 |

> Variable values are filled automatically by the MIS in this exact order — do **not**
> reorder, add, or remove variables, or sending will fail with a "parameter mismatch" error.
> WhatsApp does not allow line breaks *inside* a variable (benefits text is therefore not
> a variable — put fixed benefit lines directly in the body text if you want them, or make
> a second template per card type).

Submit and wait for approval (usually minutes to a few hours; you get status in the panel).

## 2. Repeat for every branch number

Log in to each branch's whatsbizapi.com account/number and create the **identical** template
(same name `membership_card`, same language `en`, same body). Approval is per-number.

## 3. Configure the MIS

For each branch: **Branches ▸ Edit ▸ WhatsApp Official API** section:

1. Paste that branch's **API key** (from whatsbizapi.com ▸ API / token page).
2. Card template name: `membership_card` (or leave blank — that's the default).
3. Template language: `en` (or leave blank — default).
4. **Test this key:** type your own mobile number ▸ **📶 Send test** ▸ you should receive a
   plain text message on WhatsApp within seconds. (Text messages to a number that has not
   messaged you in 24 h may be blocked by WhatsApp — if the test fails with a "24-hour
   window" style error but the key is right, send "hi" from your phone to the branch's
   WhatsApp number first, then test again.)
5. Save.

## 4. Send a card (the new 3rd option)

Membership Cards ▸ open any card ▸ **Option 3 · 🚀 Send via Official API**.
The MIS renders the card image, uploads it, and sends the approved template with the
image + details to the customer's number — no phone, no WhatsApp Web, no clipboard.
`sentAt` is stamped automatically.

## Troubleshooting

| Error | Cause / fix |
|---|---|
| "No WhatsApp API key saved for …" | Paste the key in Branches ▸ Edit for that branch. |
| "Is template … approved for this number?" | Template missing/not yet approved on that branch's number, or name/language mismatch. |
| Parameter / #132000 mismatch | Body variables were changed — keep exactly 6, in the order above. |
| Message shows sent but never arrives | Recipient number wrong (needs 10-digit Indian mobile) or the customer blocked the business number. |
| Test works, template fails | Templates are per-number: the branch you're sending from hasn't got the approved template yet. |
