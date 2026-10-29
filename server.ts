import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Initialize Google GenAI if key is present and not dummy placeholder
const rawApiKey = process.env.GEMINI_API_KEY || '';
const apiKey = rawApiKey.trim() !== '' && rawApiKey !== 'MY_GEMINI_API_KEY' ? rawApiKey : '';
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

interface JournalEntryResponse {
  voucherType: string;
  voucherShortcut: string;
  voucherExplanation: string;
  debitEntries: Array<{
    ledgerName: string;
    amount: string;
    tallyGroup: string;
    ruleType: 'Real Account' | 'Personal Account' | 'Nominal Account';
    ruleReason: string;
  }>;
  creditEntries: Array<{
    ledgerName: string;
    amount: string;
    tallyGroup: string;
    ruleType: 'Real Account' | 'Personal Account' | 'Nominal Account';
    ruleReason: string;
  }>;
  narration: string;
  goldenRulesSummary: string;
  tallySteps: string[];
  source: 'gemini' | 'rule-engine';
}

// Fallback heuristic rule-based accounting engine
function solveWithRuleEngine(query: string): JournalEntryResponse {
  const text = query.trim();
  const lower = text.toLowerCase();

  // Extract amount
  const amountMatch = text.match(/(?:rs\.?|inr|₹)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+)/i);
  let amountStr = '1,00,000';
  if (amountMatch && amountMatch[1]) {
    amountStr = amountMatch[1];
  }

  // Common pattern checks
  if (lower.includes('started business') || lower.includes('commenced business') || lower.includes('introduced capital')) {
    const isBank = lower.includes('bank') || lower.includes('cheque');
    const debitLedger = isBank ? 'Bank Account' : 'Cash Account';
    const debitGroup = isBank ? 'Bank Accounts' : 'Cash-in-hand';

    return {
      voucherType: 'Receipt',
      voucherShortcut: 'F6',
      voucherExplanation: 'Money is received into the business as capital from the owner.',
      debitEntries: [
        {
          ledgerName: debitLedger,
          amount: amountStr,
          tallyGroup: debitGroup,
          ruleType: 'Real Account',
          ruleReason: 'Debit what comes in (Cash/Bank balance increases in the business)',
        },
      ],
      creditEntries: [
        {
          ledgerName: 'Capital Account',
          amount: amountStr,
          tallyGroup: 'Capital Account',
          ruleType: 'Personal Account',
          ruleReason: 'Credit the giver (Proprietor/Owner is investing capital)',
        },
      ],
      narration: `(Being capital introduced by proprietor to start business)`,
      goldenRulesSummary: 'Cash/Bank is a Real Account (Debit what comes in). Capital is a Personal Account representing the owner (Credit the giver).',
      tallySteps: [
        'Press [F6] to open Receipt Voucher.',
        'In "Account" field: Select Cash or Bank Account.',
        'In "Particulars" field: Select "Capital Account" (Under Capital Account).',
        `Enter Amount: ₹${amountStr}.`,
        'Type Narration and press Ctrl+A to save.',
      ],
      source: 'rule-engine',
    };
  }

  if (lower.includes('deposited') && (lower.includes('bank') || lower.includes('cash'))) {
    const bankName = text.match(/(?:into|in)\s+([A-Za-z\s]+?)(?:bank|account|\s+rs|$)/i)?.[1]?.trim() || 'Bank';
    const bankLedger = bankName.toLowerCase().includes('bank') ? `${bankName} Account` : `${bankName} Bank Account`;

    return {
      voucherType: 'Contra',
      voucherShortcut: 'F4',
      voucherExplanation: 'Transfer of funds between Cash and Bank accounts without third-party involvement.',
      debitEntries: [
        {
          ledgerName: bankLedger,
          amount: amountStr,
          tallyGroup: 'Bank Accounts',
          ruleType: 'Real Account',
          ruleReason: 'Debit what comes in / Receiver of money (Bank balance increases)',
        },
      ],
      creditEntries: [
        {
          ledgerName: 'Cash Account',
          amount: amountStr,
          tallyGroup: 'Cash-in-hand',
          ruleType: 'Real Account',
          ruleReason: 'Credit what goes out (Physical cash leaves the cash drawer)',
        },
      ],
      narration: `(Being cash deposited into ${bankLedger})`,
      goldenRulesSummary: 'Both Bank and Cash are Real/Personal accounts. Bank receives deposit (Debit), Cash goes out (Credit). Use Contra [F4].',
      tallySteps: [
        'Press [F4] to open Contra Voucher.',
        `In "Account" field: Select ${bankLedger}.`,
        'In "Particulars" field: Select Cash Account.',
        `Enter Amount: ₹${amountStr}. Enter denomination details if required.`,
        'Press Ctrl+A to save.',
      ],
      source: 'rule-engine',
    };
  }

  if (lower.includes('withdrew') || lower.includes('withdrawn')) {
    if (lower.includes('personal') || lower.includes('domestic') || lower.includes('household') || lower.includes('drawings')) {
      const isBank = lower.includes('bank') || lower.includes('cheque');
      return {
        voucherType: 'Payment',
        voucherShortcut: 'F5',
        voucherExplanation: 'Funds withdrawn by owner for personal use (Drawings).',
        debitEntries: [
          {
            ledgerName: 'Drawings Account',
            amount: amountStr,
            tallyGroup: 'Capital Account',
            ruleType: 'Personal Account',
            ruleReason: 'Debit the receiver (Owner receives benefit for personal use)',
          },
        ],
        creditEntries: [
          {
            ledgerName: isBank ? 'Bank Account' : 'Cash Account',
            amount: amountStr,
            tallyGroup: isBank ? 'Bank Accounts' : 'Cash-in-hand',
            ruleType: 'Real Account',
            ruleReason: 'Credit what goes out (Funds leave business)',
          },
        ],
        narration: `(Being cash/bank funds withdrawn by owner for personal use)`,
        goldenRulesSummary: 'Drawings is a Personal Account representing the proprietor (Debit the receiver). Cash/Bank is a Real Account (Credit what goes out).',
        tallySteps: [
          'Press [F5] to open Payment Voucher.',
          'In "Account" field: Select Cash or Bank Account.',
          'In "Particulars": Select Drawings Account (Under Capital Account).',
          `Enter Amount: ₹${amountStr}.`,
          'Press Ctrl+A to save.',
        ],
        source: 'rule-engine',
      };
    } else if (lower.includes('office') || lower.includes('business')) {
      return {
        voucherType: 'Contra',
        voucherShortcut: 'F4',
        voucherExplanation: 'Cash withdrawn from bank for office use (internal cash movement).',
        debitEntries: [
          {
            ledgerName: 'Cash Account',
            amount: amountStr,
            tallyGroup: 'Cash-in-hand',
            ruleType: 'Real Account',
            ruleReason: 'Debit what comes in (Cash enters office drawer)',
          },
        ],
        creditEntries: [
          {
            ledgerName: 'Bank Account',
            amount: amountStr,
            tallyGroup: 'Bank Accounts',
            ruleType: 'Personal Account',
            ruleReason: 'Credit the giver (Bank gives out funds)',
          },
        ],
        narration: `(Being cash withdrawn from bank for office use)`,
        goldenRulesSummary: 'Contra voucher [F4] handles internal cash-to-bank and bank-to-cash transactions.',
        tallySteps: [
          'Press [F4] to open Contra Voucher.',
          'In "Account" field: Select Cash Account.',
          'In "Particulars": Select Bank Account.',
          `Enter Amount: ₹${amountStr}.`,
          'Press Ctrl+A to save.',
        ],
        source: 'rule-engine',
      };
    }
  }

  if (lower.includes('purchased') || lower.includes('bought')) {
    const isGoods = lower.includes('goods') || lower.includes('merchandise') || lower.includes('stock');
    const isCash = lower.includes('cash');
    const isBank = lower.includes('cheque') || lower.includes('neft') || lower.includes('rtgs') || lower.includes('online') || lower.includes('bank');

    if (isGoods) {
      if (isCash || isBank) {
        const paymentLedger = isBank ? 'Bank Account' : 'Cash Account';
        return {
          voucherType: 'Payment or Purchase',
          voucherShortcut: 'F5 / F9',
          voucherExplanation: 'Cash purchase of goods can be recorded in Purchase [F9] or Payment [F5].',
          debitEntries: [
            {
              ledgerName: 'Purchases Account',
              amount: amountStr,
              tallyGroup: 'Purchase Accounts',
              ruleType: 'Nominal Account',
              ruleReason: 'Debit all expenses and losses (Cost of goods purchased)',
            },
          ],
          creditEntries: [
            {
              ledgerName: paymentLedger,
              amount: amountStr,
              tallyGroup: isBank ? 'Bank Accounts' : 'Cash-in-hand',
              ruleType: 'Real Account',
              ruleReason: 'Credit what goes out (Payment made immediately)',
            },
          ],
          narration: `(Being goods purchased for ${isBank ? 'bank transfer' : 'cash'})`,
          goldenRulesSummary: 'Purchases is a Nominal Account (Debit expenses). Cash/Bank is a Real Account (Credit what goes out).',
          tallySteps: [
            'Press [F9] for Purchase Voucher (or [F5] for Payment).',
            `Select Party: ${paymentLedger}.`,
            'Select Purchase Ledger: Purchases A/c.',
            `Enter Amount: ₹${amountStr}.`,
            'Press Ctrl+A to save.',
          ],
          source: 'rule-engine',
        };
      } else {
        // Credit purchase from supplier
        const partyNameMatch = text.match(/(?:from)\s+([A-Za-z0-9\s.,]+?)(?:\s+on\s+credit|\s+for|\s+rs|\s+worth|$)/i);
        const supplierName = partyNameMatch ? partyNameMatch[1].trim() : 'Sundry Creditor';
        return {
          voucherType: 'Purchase',
          voucherShortcut: 'F9',
          voucherExplanation: 'Credit purchase of goods from supplier.',
          debitEntries: [
            {
              ledgerName: 'Purchases Account',
              amount: amountStr,
              tallyGroup: 'Purchase Accounts',
              ruleType: 'Nominal Account',
              ruleReason: 'Debit all expenses and losses',
            },
          ],
          creditEntries: [
            {
              ledgerName: `${supplierName} (Creditor)`,
              amount: amountStr,
              tallyGroup: 'Sundry Creditors',
              ruleType: 'Personal Account',
              ruleReason: 'Credit the giver (Supplier provides goods on credit)',
            },
          ],
          narration: `(Being goods purchased on credit from ${supplierName})`,
          goldenRulesSummary: 'Purchases is Nominal (Debit all expenses). Supplier is Personal (Credit the giver).',
          tallySteps: [
            'Press [F9] to open Purchase Voucher.',
            `In "Party A/c Name": Select ${supplierName} (Group: Sundry Creditors).`,
            'In "Purchase Ledger": Select Purchases Account.',
            `Enter Item/Amount: ₹${amountStr}.`,
            'Press Ctrl+A to save.',
          ],
          source: 'rule-engine',
        };
      }
    } else {
      // Fixed Asset purchase (e.g. computer, furniture, machinery)
      const assetMatch = text.match(/(?:purchased|bought)\s+([A-Za-z\s]+?)(?:\s+for|\s+from|\s+worth|\s+on|\s+rs|$)/i);
      const assetName = assetMatch ? assetMatch[1].trim() : 'Fixed Asset';
      const isCredit = lower.includes('on credit') || (!isCash && !isBank && lower.includes('from'));
      
      if (isCredit) {
        const partyMatch = text.match(/(?:from)\s+([A-Za-z0-9\s.,]+?)(?:\s+on|\s+for|\s+rs|$)/i);
        const vendor = partyMatch ? partyMatch[1].trim() : 'Vendor / Supplier';
        return {
          voucherType: 'Journal',
          voucherShortcut: 'F7',
          voucherExplanation: 'Credit purchase of fixed asset (not goods) is recorded in Journal Voucher [F7].',
          debitEntries: [
            {
              ledgerName: `${assetName} Account`,
              amount: amountStr,
              tallyGroup: 'Fixed Assets',
              ruleType: 'Real Account',
              ruleReason: 'Debit what comes in (Asset acquired)',
            },
          ],
          creditEntries: [
            {
              ledgerName: `${vendor} Account`,
              amount: amountStr,
              tallyGroup: 'Sundry Creditors',
              ruleType: 'Personal Account',
              ruleReason: 'Credit the giver (Vendor)',
            },
          ],
          narration: `(Being ${assetName} purchased on credit from ${vendor})`,
          goldenRulesSummary: 'Fixed Asset is a Real Account (Debit what comes in). Vendor is a Personal Account (Credit the giver). Since it is not cash or goods, use Journal [F7].',
          tallySteps: [
            'Press [F7] to open Journal Voucher.',
            `By (Dr): ${assetName} Account -> ₹${amountStr}`,
            `To (Cr): ${vendor} Account -> ₹${amountStr}`,
            'Press Ctrl+A to save.',
          ],
          source: 'rule-engine',
        };
      } else {
        return {
          voucherType: 'Payment',
          voucherShortcut: 'F5',
          voucherExplanation: 'Cash/Bank payment for asset purchase.',
          debitEntries: [
            {
              ledgerName: `${assetName} Account`,
              amount: amountStr,
              tallyGroup: 'Fixed Assets',
              ruleType: 'Real Account',
              ruleReason: 'Debit what comes in (Asset acquired)',
            },
          ],
          creditEntries: [
            {
              ledgerName: isBank ? 'Bank Account' : 'Cash Account',
              amount: amountStr,
              tallyGroup: isBank ? 'Bank Accounts' : 'Cash-in-hand',
              ruleType: 'Real Account',
              ruleReason: 'Credit what goes out',
            },
          ],
          narration: `(Being ${assetName} purchased for ${isBank ? 'cheque/bank' : 'cash'})`,
          goldenRulesSummary: 'Asset comes in (Debit - Real A/c), Cash/Bank goes out (Credit - Real A/c). Recorded in Payment [F5].',
          tallySteps: [
            'Press [F5] to open Payment Voucher.',
            `Account: ${isBank ? 'Bank Account' : 'Cash Account'}`,
            `Particulars: ${assetName} Account -> ₹${amountStr}`,
            'Press Ctrl+A to save.',
          ],
          source: 'rule-engine',
        };
      }
    }
  }

  if (lower.includes('sold goods') || lower.includes('sale of goods') || lower.includes('sold merchandise')) {
    const isCash = lower.includes('cash');
    const isBank = lower.includes('cheque') || lower.includes('bank') || lower.includes('neft') || lower.includes('online');
    
    if (isCash || isBank) {
      const receiptLedger = isBank ? 'Bank Account' : 'Cash Account';
      return {
        voucherType: 'Receipt or Sales',
        voucherShortcut: 'F6 / F8',
        voucherExplanation: 'Cash sale of goods can be recorded in Sales [F8] or Receipt [F6].',
        debitEntries: [
          {
            ledgerName: receiptLedger,
            amount: amountStr,
            tallyGroup: isBank ? 'Bank Accounts' : 'Cash-in-hand',
            ruleType: 'Real Account',
            ruleReason: 'Debit what comes in (Money received)',
          },
        ],
        creditEntries: [
          {
            ledgerName: 'Sales Account',
            amount: amountStr,
            tallyGroup: 'Sales Accounts',
            ruleType: 'Nominal Account',
            ruleReason: 'Credit all incomes and gains (Revenue from sale of goods)',
          },
        ],
        narration: `(Being goods sold for ${isBank ? 'bank transfer' : 'cash'})`,
        goldenRulesSummary: 'Cash/Bank is Real (Debit what comes in). Sales is Nominal (Credit all incomes and gains).',
        tallySteps: [
          'Press [F8] to open Sales Voucher (or [F6] for Receipt).',
          `Select Party: ${receiptLedger}.`,
          'Select Sales Ledger: Sales Account.',
          `Enter Amount: ₹${amountStr}.`,
          'Press Ctrl+A to save.',
        ],
        source: 'rule-engine',
      };
    } else {
      const customerMatch = text.match(/(?:to)\s+([A-Za-z0-9\s.,]+?)(?:\s+on\s+credit|\s+for|\s+rs|\s+worth|$)/i);
      const customerName = customerMatch ? customerMatch[1].trim() : 'Customer';
      return {
        voucherType: 'Sales',
        voucherShortcut: 'F8',
        voucherExplanation: 'Credit sale of goods to customer.',
        debitEntries: [
          {
            ledgerName: `${customerName} (Debtor)`,
            amount: amountStr,
            tallyGroup: 'Sundry Debtors',
            ruleType: 'Personal Account',
            ruleReason: 'Debit the receiver (Customer receives goods on credit)',
          },
        ],
        creditEntries: [
          {
            ledgerName: 'Sales Account',
            amount: amountStr,
            tallyGroup: 'Sales Accounts',
            ruleType: 'Nominal Account',
            ruleReason: 'Credit all incomes and gains',
          },
        ],
        narration: `(Being goods sold on credit to ${customerName})`,
        goldenRulesSummary: 'Customer is Personal Account (Debit the receiver). Sales is Nominal Account (Credit incomes/gains).',
        tallySteps: [
          'Press [F8] to open Sales Voucher.',
          `In "Party A/c Name": Select ${customerName} (Group: Sundry Debtors).`,
          'In "Sales Ledger": Select Sales Account.',
          `Enter Amount: ₹${amountStr}.`,
          'Press Ctrl+A to save.',
        ],
        source: 'rule-engine',
      };
    }
  }

  if (lower.includes('paid rent') || lower.includes('paid salary') || lower.includes('paid wages') || lower.includes('paid electricity') || lower.includes('paid commission') || lower.includes('paid insurance') || lower.includes('paid interest') || lower.includes('paid telephone') || lower.includes('paid freight')) {
    const expenseMatch = text.match(/(?:paid)\s+([A-Za-z\s]+?)(?:\s+by|\s+in|\s+to|\s+of|\s+rs|$)/i);
    const expName = expenseMatch ? expenseMatch[1].trim() : 'Expense';
    const isBank = lower.includes('cheque') || lower.includes('bank') || lower.includes('neft') || lower.includes('online');

    return {
      voucherType: 'Payment',
      voucherShortcut: 'F5',
      voucherExplanation: 'Payment voucher is used for recording business expense disbursements.',
      debitEntries: [
        {
          ledgerName: `${expName.charAt(0).toUpperCase() + expName.slice(1)} Account`,
          amount: amountStr,
          tallyGroup: 'Indirect Expenses',
          ruleType: 'Nominal Account',
          ruleReason: 'Debit all expenses and losses',
        },
      ],
      creditEntries: [
        {
          ledgerName: isBank ? 'Bank Account' : 'Cash Account',
          amount: amountStr,
          tallyGroup: isBank ? 'Bank Accounts' : 'Cash-in-hand',
          ruleType: 'Real Account',
          ruleReason: 'Credit what goes out',
        },
      ],
      narration: `(Being ${expName} paid ${isBank ? 'by cheque/bank' : 'in cash'})`,
      goldenRulesSummary: 'Expense is Nominal Account (Debit all expenses). Cash/Bank is Real Account (Credit what goes out). Recorded in Payment [F5].',
      tallySteps: [
        'Press [F5] to open Payment Voucher.',
        `In "Account" field: Select ${isBank ? 'Bank Account' : 'Cash Account'}.`,
        `In "Particulars": Select ${expName} Account.`,
        `Enter Amount: ₹${amountStr}.`,
        'Press Ctrl+A to save.',
      ],
      source: 'rule-engine',
    };
  }

  if (lower.includes('depreciation') || lower.includes('depreciated')) {
    const assetMatch = text.match(/(?:on)\s+([A-Za-z\s]+?)(?:@|\s+of|\s+rs|$)/i);
    const asset = assetMatch ? assetMatch[1].trim() : 'Fixed Asset';
    return {
      voucherType: 'Journal',
      voucherShortcut: 'F7',
      voucherExplanation: 'Non-cash accounting adjustment entered in Journal Voucher [F7].',
      debitEntries: [
        {
          ledgerName: 'Depreciation Account',
          amount: amountStr,
          tallyGroup: 'Indirect Expenses',
          ruleType: 'Nominal Account',
          ruleReason: 'Debit all expenses and losses (Depreciation is a non-cash expense)',
        },
      ],
      creditEntries: [
        {
          ledgerName: `${asset} Account`,
          amount: amountStr,
          tallyGroup: 'Fixed Assets',
          ruleType: 'Real Account',
          ruleReason: 'Credit the asset to reduce its book value',
        },
      ],
      narration: `(Being depreciation charged on ${asset})`,
      goldenRulesSummary: 'Depreciation is Nominal (Debit all expenses). Asset value decreases (Credit to asset - Real A/c). Journal voucher [F7] is used.',
      tallySteps: [
        'Press [F7] to open Journal Voucher.',
        `By (Dr): Depreciation Account -> ₹${amountStr}`,
        `To (Cr): ${asset} Account -> ₹${amountStr}`,
        'Press Ctrl+A to save.',
      ],
      source: 'rule-engine',
    };
  }

  if (lower.includes('goods returned by') || lower.includes('return inward')) {
    const debtorMatch = text.match(/(?:by)\s+([A-Za-z0-9\s.,]+?)(?:\s+rs|\s+worth|$)/i);
    const debtor = debtorMatch ? debtorMatch[1].trim() : 'Customer';
    return {
      voucherType: 'Credit Note',
      voucherShortcut: 'Alt+F6',
      voucherExplanation: 'Customer returned previously sold goods (Sales Return).',
      debitEntries: [
        {
          ledgerName: 'Sales Return / Return Inward A/c',
          amount: amountStr,
          tallyGroup: 'Sales Accounts',
          ruleType: 'Nominal Account',
          ruleReason: 'Debit reduction in sales income / return of goods',
        },
      ],
      creditEntries: [
        {
          ledgerName: `${debtor} Account`,
          amount: amountStr,
          tallyGroup: 'Sundry Debtors',
          ruleType: 'Personal Account',
          ruleReason: 'Credit the giver (Customer returning goods)',
        },
      ],
      narration: `(Being goods returned by customer ${debtor})`,
      goldenRulesSummary: 'Sales Return is Nominal/Real (Debit return). Debtor is Personal (Credit the giver). Recorded in Credit Note [Alt+F6].',
      tallySteps: [
        'Press [Alt+F6] to open Credit Note Voucher.',
        `Select Party: ${debtor}.`,
        'Select Ledger: Sales Return Account.',
        `Enter Amount: ₹${amountStr}.`,
        'Press Ctrl+A to save.',
      ],
      source: 'rule-engine',
    };
  }

  if (lower.includes('goods returned to') || lower.includes('return outward')) {
    const credMatch = text.match(/(?:to)\s+([A-Za-z0-9\s.,]+?)(?:\s+rs|\s+worth|$)/i);
    const cred = credMatch ? credMatch[1].trim() : 'Supplier';
    return {
      voucherType: 'Debit Note',
      voucherShortcut: 'Alt+F5',
      voucherExplanation: 'Goods returned to supplier (Purchase Return).',
      debitEntries: [
        {
          ledgerName: `${cred} Account`,
          amount: amountStr,
          tallyGroup: 'Sundry Creditors',
          ruleType: 'Personal Account',
          ruleReason: 'Debit the receiver (Supplier receives returned goods)',
        },
      ],
      creditEntries: [
        {
          ledgerName: 'Purchase Return / Return Outward A/c',
          amount: amountStr,
          tallyGroup: 'Purchase Accounts',
          ruleType: 'Nominal Account',
          ruleReason: 'Credit reduction in purchase cost',
        },
      ],
      narration: `(Being goods returned to supplier ${cred})`,
      goldenRulesSummary: 'Supplier is Personal (Debit the receiver). Purchase Return is Nominal (Credit reduction in expense). Recorded in Debit Note [Alt+F5].',
      tallySteps: [
        'Press [Alt+F5] to open Debit Note Voucher.',
        `Select Party: ${cred}.`,
        'Select Ledger: Purchase Return Account.',
        `Enter Amount: ₹${amountStr}.`,
        'Press Ctrl+A to save.',
      ],
      source: 'rule-engine',
    };
  }

  // Generic intelligent fallback
  return {
    voucherType: 'Journal',
    voucherShortcut: 'F7',
    voucherExplanation: 'General accounting journal entry recorded in Tally.',
    debitEntries: [
      {
        ledgerName: 'Debit Ledger Account',
        amount: amountStr,
        tallyGroup: 'Direct / Indirect Expenses or Assets',
        ruleType: 'Nominal Account',
        ruleReason: 'Debit the receiver or debit what comes in or debit expenses',
      },
    ],
    creditEntries: [
      {
        ledgerName: 'Credit Ledger Account',
        amount: amountStr,
        tallyGroup: 'Sundry Creditors, Capital, or Revenue',
        ruleType: 'Personal Account',
        ruleReason: 'Credit the giver or credit what goes out or credit incomes',
      },
    ],
    narration: `(Being transaction recorded: ${text})`,
    goldenRulesSummary: 'Real: Debit what comes in, Credit what goes out. Personal: Debit the receiver, Credit the giver. Nominal: Debit all expenses/losses, Credit all incomes/gains.',
    tallySteps: [
      'Open Gateway of Tally > Vouchers.',
      'Press [F7] for Journal (or [F5] for Payment, [F6] for Receipt).',
      'Select Debit ledger, enter amount.',
      'Select Credit ledger, enter amount.',
      'Enter narration and save (Ctrl+A).',
    ],
    source: 'rule-engine',
  };
}

// API endpoint to solve entry
app.post('/api/solve', async (req, res) => {
  const { transaction } = req.body;

  if (!transaction || typeof transaction !== 'string' || !transaction.trim()) {
    return res.status(400).json({ error: 'Please provide an accounting transaction text.' });
  }

  const promptText = transaction.trim();

  if (ai) {
    try {
      const geminiPromise = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `You are an expert Chartered Accountant and Tally Prime/ERP 9 specialist.
Analyze this accounting transaction and provide the exact Tally journal entry according to Double Entry Bookkeeping and Golden Rules of Accounting:

Transaction: "${promptText}"

Return a strict JSON object with:
- voucherType: String (e.g., "Receipt", "Payment", "Contra", "Sales", "Purchase", "Journal", "Credit Note", "Debit Note")
- voucherShortcut: String (e.g., "F6", "F5", "F4", "F8", "F9", "F7", "Alt+F6", "Alt+F5")
- voucherExplanation: String (1-2 sentences explaining why this specific voucher is selected in Tally)
- debitEntries: Array of objects with:
    - ledgerName: exact Tally ledger name (e.g., "Cash A/c", "Purchases A/c", "Rent Expenses A/c")
    - amount: string amount with commas e.g. "1,00,000"
    - tallyGroup: recommended Tally Group under which this ledger is created (e.g. "Cash-in-hand", "Indirect Expenses", "Sundry Debtors")
    - ruleType: "Real Account" | "Personal Account" | "Nominal Account"
    - ruleReason: concise Golden Rule application
- creditEntries: Array of objects with:
    - ledgerName: exact Tally ledger name (e.g., "Capital A/c", "Sales A/c", "State Bank of India A/c")
    - amount: string amount
    - tallyGroup: recommended Tally Group (e.g. "Capital Account", "Sales Accounts", "Bank Accounts")
    - ruleType: "Real Account" | "Personal Account" | "Nominal Account"
    - ruleReason: concise Golden Rule application
- narration: String starting with "(Being ...)"
- goldenRulesSummary: String explaining the accounting golden rules for this transaction
- tallySteps: Array of 4-5 quick step-by-step keystroke instructions in Tally Prime`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              voucherType: { type: Type.STRING },
              voucherShortcut: { type: Type.STRING },
              voucherExplanation: { type: Type.STRING },
              debitEntries: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    ledgerName: { type: Type.STRING },
                    amount: { type: Type.STRING },
                    tallyGroup: { type: Type.STRING },
                    ruleType: {
                      type: Type.STRING,
                      enum: ['Real Account', 'Personal Account', 'Nominal Account'],
                    },
                    ruleReason: { type: Type.STRING },
                  },
                  required: ['ledgerName', 'amount', 'tallyGroup', 'ruleType', 'ruleReason'],
                },
              },
              creditEntries: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    ledgerName: { type: Type.STRING },
                    amount: { type: Type.STRING },
                    tallyGroup: { type: Type.STRING },
                    ruleType: {
                      type: Type.STRING,
                      enum: ['Real Account', 'Personal Account', 'Nominal Account'],
                    },
                    ruleReason: { type: Type.STRING },
                  },
                  required: ['ledgerName', 'amount', 'tallyGroup', 'ruleType', 'ruleReason'],
                },
              },
              narration: { type: Type.STRING },
              goldenRulesSummary: { type: Type.STRING },
              tallySteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'voucherType',
              'voucherShortcut',
              'voucherExplanation',
              'debitEntries',
              'creditEntries',
              'narration',
              'goldenRulesSummary',
              'tallySteps',
            ],
          },
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API call timed out')), 8500)
      );

      const response = (await Promise.race([geminiPromise, timeoutPromise])) as any;

      const parsed = JSON.parse(response.text || '{}');
      return res.json({
        ...parsed,
        source: 'gemini',
      });
    } catch (err: any) {
      console.warn('Gemini API call failed or timed out, falling back to rule engine:', err?.message);
      // Fallback seamlessly to built-in rule engine
      const fallbackResult = solveWithRuleEngine(promptText);
      return res.json(fallbackResult);
    }
  }

  // Fallback to rule engine if no API key is provided
  const ruleResult = solveWithRuleEngine(promptText);
  return res.json(ruleResult);
});

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tally Journal Entry Solver server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
