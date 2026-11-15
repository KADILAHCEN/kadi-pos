import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Download,
  FileCode2,
  FileJson,
  Loader2,
  Mail,
  Send,
  Upload,
  X
} from 'lucide-react';
import { User } from 'firebase/auth';
import { usePos } from '../../context/PosContext';
import { triggerTextFileDownload, utf8StringToBase64 } from '../../utils/catalogGmailExport';
import {
  CreditLedgerExportScope,
  buildCreditLedgerEmailSummaryHtml,
  buildPortableCreditLedgerHtml,
  buildPortableCreditLedgerJson,
  computeCreditLedgerAnalytics
} from '../../utils/creditLedgerGmailExport';
import {
  GmailAttachmentInput,
  getWorkspaceAccessToken,
  initGoogleWorkspaceAuth,
  sendGmailMessageWithAttachment,
  signInWithGoogleWorkspace
} from '../../utils/googleWorkspace';

interface ExportCreditLedgerGmailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CreditFileFormat = 'both' | 'html' | 'json';

export const ExportCreditLedgerGmailModal: React.FC<ExportCreditLedgerGmailModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    customers,
    creditTransactions,
    settings,
    currencySymbol,
    importDatabaseJson,
    language
  } = usePos();

  const isAr = language === 'ar';

  const [scope, setScope] = useState<CreditLedgerExportScope>('all');
  const [format, setFormat] = useState<CreditFileFormat>('both');
  const [recipientEmail, setRecipientEmail] = useState(
    settings.scheduledReportEmail || settings.email || ''
  );
  const [emailSubject, setEmailSubject] = useState(
    isAr
      ? `كناش الكريدي وحسابات الزبناء - ${settings.storeName}`
      : `Credit Ledger Backup & Statement - ${settings.storeName}`
  );
  const [customNote, setCustomNote] = useState('');

  const [wsUser, setWsUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(() => !getWorkspaceAccessToken());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [pendingRestoreJson, setPendingRestoreJson] = useState<{
    raw: string;
    customersCount: number;
    txCount: number;
    filename: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFeedback(null);
    setConfirmSendOpen(false);
    setPendingRestoreJson(null);
  }, [isOpen]);

  useEffect(() => {
    const unsub = initGoogleWorkspaceAuth(
      (user) => {
        setWsUser(user);
        setNeedsAuth(false);
        if (!recipientEmail && user.email) {
          setRecipientEmail(user.email);
        }
      },
      () => {
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, [recipientEmail]);

  const analytics = useMemo(
    () => computeCreditLedgerAnalytics(customers, creditTransactions, scope),
    [customers, creditTransactions, scope]
  );

  const buildAttachmentsAndBody = (): {
    attachments: GmailAttachmentInput[];
    emailHtml: string;
    filenames: string[];
  } => {
    const stamp = new Date().toISOString().slice(0, 10);
    const attachments: GmailAttachmentInput[] = [];
    const filenames: string[] = [];

    if (format === 'html' || format === 'both') {
      const htmlContent = buildPortableCreditLedgerHtml({
        customers,
        creditTransactions,
        settings,
        currencySymbol,
        scope,
        note: customNote.trim() || undefined
      });
      const htmlFilename = `KadiPOS_CreditLedger_${stamp}.html`;
      attachments.push({
        filename: htmlFilename,
        mimeType: 'text/html; charset=utf-8',
        contentBase64: utf8StringToBase64(htmlContent)
      });
      filenames.push(htmlFilename);
    }

    if (format === 'json' || format === 'both') {
      const jsonContent = buildPortableCreditLedgerJson({
        customers,
        creditTransactions,
        settings,
        currencySymbol,
        scope
      });
      const jsonFilename = `KadiPOS_CreditLedger_Data_${stamp}.json`;
      attachments.push({
        filename: jsonFilename,
        mimeType: 'application/json; charset=utf-8',
        contentBase64: utf8StringToBase64(jsonContent)
      });
      filenames.push(jsonFilename);
    }

    const emailHtml = buildCreditLedgerEmailSummaryHtml({
      customers,
      creditTransactions,
      settings,
      currencySymbol,
      scope,
      note: customNote.trim() || undefined
    });

    return { attachments, emailHtml, filenames };
  };

  const handleDownloadFilesLocally = () => {
    if (analytics.scopedCustomers.length === 0) return;
    setIsGenerating(true);
    setFeedback(null);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const saved: string[] = [];

      if (format === 'html' || format === 'both') {
        const htmlContent = buildPortableCreditLedgerHtml({
          customers,
          creditTransactions,
          settings,
          currencySymbol,
          scope,
          note: customNote.trim() || undefined
        });
        const name = `KadiPOS_CreditLedger_${stamp}.html`;
        triggerTextFileDownload(htmlContent, name, 'text/html;charset=utf-8');
        saved.push(name);
      }

      if (format === 'json' || format === 'both') {
        const jsonContent = buildPortableCreditLedgerJson({
          customers,
          creditTransactions,
          settings,
          currencySymbol,
          scope
        });
        const name = `KadiPOS_CreditLedger_Data_${stamp}.json`;
        triggerTextFileDownload(jsonContent, name, 'application/json;charset=utf-8');
        saved.push(name);
      }

      setFeedback({
        type: 'success',
        text: isAr
          ? `✓ تم حفظ ملف كناش الكريدي بنجاح: ${saved.join(' + ')}`
          : `✓ Credit ledger saved: ${saved.join(' + ')}`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to export credit ledger'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setFeedback(null);
    try {
      const { user } = await signInWithGoogleWorkspace();
      setWsUser(user);
      setNeedsAuth(false);
      if (!recipientEmail && user.email) {
        setRecipientEmail(user.email);
      }
      setFeedback({
        type: 'success',
        text: isAr
          ? `تم الاتصال بحساب Gmail (${user.email || 'متصل'}) بنجاح`
          : `Connected to Google (${user.email || 'active'})`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Google Sign-In failed'
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleConfirmedSendGmail = async () => {
    setConfirmSendOpen(false);
    if (!recipientEmail.trim()) return;
    setIsGenerating(true);
    setFeedback(null);

    try {
      const { attachments, emailHtml, filenames } = buildAttachmentsAndBody();
      await sendGmailMessageWithAttachment({
        to: recipientEmail.trim(),
        subject:
          emailSubject.trim() || `Kadi POS Credit Ledger (${new Date().toISOString().slice(0, 10)})`,
        htmlBody: emailHtml,
        attachments
      });
      setFeedback({
        type: 'success',
        text: isAr
          ? `✓ تم إرسال كناش الكريدي (${filenames.join('، ')}) إلى ${recipientEmail.trim()} عبر Gmail بنجاح!`
          : `✓ Credit ledger (${filenames.join(', ')}) sent via Gmail to ${recipientEmail.trim()}!`
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gmail send failed';
      if (msg === 'AUTH_REQUIRED' || msg === 'AUTH_EXPIRED') {
        setNeedsAuth(true);
        setFeedback({
          type: 'error',
          text: isAr
            ? 'انتهت جلسة Gmail المؤقتة. اضغط Sign in with Google مجدداً للمتابعة.'
            : 'Google session expired. Please sign in again.'
        });
      } else {
        setFeedback({ type: 'error', text: msg });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectLedgerJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = String(reader.result || '{}');
        const parsed = JSON.parse(raw) as {
          customers?: unknown[];
          creditTransactions?: unknown[];
        };
        if (!Array.isArray(parsed.customers)) {
          throw new Error(
            isAr ? 'ملف كناش الكريدي غير صالح (لا يحتوي على بيانات الزبناء)' : 'Invalid ledger JSON'
          );
        }
        setPendingRestoreJson({
          raw,
          customersCount: parsed.customers.length,
          txCount: Array.isArray(parsed.creditTransactions) ? parsed.creditTransactions.length : 0,
          filename: file.name
        });
      } catch (err) {
        setFeedback({
          type: 'error',
          text: err instanceof Error ? err.message : 'Invalid JSON file'
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmRestoreLedgerJson = () => {
    if (!pendingRestoreJson) return;
    const ok = importDatabaseJson(pendingRestoreJson.raw);
    if (ok) {
      setFeedback({
        type: 'success',
        text: isAr
          ? `✓ تم استيراد كناش الكريدي (${pendingRestoreJson.customersCount} زبون و ${pendingRestoreJson.txCount} حركة) بنجاح!`
          : `✓ Restored ${pendingRestoreJson.customersCount} customers and ${pendingRestoreJson.txCount} transactions!`
      });
    } else {
      setFeedback({
        type: 'error',
        text: isAr ? 'تعذر استيراد ملف كناش الكريدي' : 'Failed to restore ledger JSON'
      });
    }
    setPendingRestoreJson(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl max-h-[90vh] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-700 via-slate-900 to-rose-800 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-black">
                {isAr
                  ? 'حفظ وتصدير كناش الكريدي إلى ملف و Gmail'
                  : 'Export Credit Ledger to File & Gmail'}
              </h3>
              <p className="text-[11px] text-amber-200">
                {isAr
                  ? `${analytics.scopedCustomers.length} زبون · ${analytics.scopedTransactions.length} حركة · الباقي: ${analytics.totalOutstandingDebt.toFixed(
                      2
                    )} ${currencySymbol}`
                  : `${analytics.scopedCustomers.length} customers · ${analytics.scopedTransactions.length} transactions`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Quick Ledger Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-center">
              <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                {isAr ? 'الكريدي المعلق' : 'Outstanding'}
              </div>
              <div className="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                {analytics.totalOutstandingDebt.toFixed(2)} {currencySymbol}
              </div>
            </div>
            <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-center">
              <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                {isAr ? `المحصّل (${analytics.collectionRatePct}%)` : 'Collected'}
              </div>
              <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                {analytics.totalPaymentsReceived.toFixed(2)} {currencySymbol}
              </div>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
              <div className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                {isAr ? 'عدد الحركات' : 'Transactions'}
              </div>
              <div className="text-sm font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                {analytics.scopedTransactions.length}
              </div>
            </div>
          </div>

          {/* Scope & File Format */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="text-[11px] font-black text-slate-700 dark:text-slate-300">
                {isAr ? 'نطاق الكناش:' : 'Ledger Scope:'}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-bold border transition-colors ${
                    scope === 'all'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {isAr ? `الكل (${customers.length})` : `All (${customers.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setScope('debtors')}
                  className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-bold border transition-colors ${
                    scope === 'debtors'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {isAr
                    ? `المدينين فقط (${customers.filter((c) => c.balance > 0).length})`
                    : 'Debtors Only'}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="text-[11px] font-black text-slate-700 dark:text-slate-300">
                {isAr ? 'صيغة الملف المرفق:' : 'File Format:'}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setFormat('both')}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold border ${
                    format === 'both'
                      ? 'bg-slate-900 dark:bg-amber-600 text-white border-slate-900'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  HTML + JSON
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('html')}
                  className={`py-1.5 px-2.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 ${
                    format === 'html'
                      ? 'bg-slate-900 dark:bg-amber-600 text-white border-slate-900'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <FileCode2 className="w-3 h-3" />
                  <span>HTML</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('json')}
                  className={`py-1.5 px-2.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 ${
                    format === 'json'
                      ? 'bg-slate-900 dark:bg-amber-600 text-white border-slate-900'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <FileJson className="w-3 h-3" />
                  <span>JSON</span>
                </button>
              </div>
            </div>
          </div>

          {/* Local Download & Restore JSON Row */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isGenerating || analytics.scopedCustomers.length === 0}
              onClick={handleDownloadFilesLocally}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-amber-400" />
              )}
              <span>{isAr ? 'حفظ كناش الكريدي في ملف' : 'Download Ledger File'}</span>
            </button>

            <label className="py-2.5 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-amber-600" />
              <span>{isAr ? 'استيراد JSON للكناش' : 'Restore JSON'}</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleSelectLedgerJson}
                className="hidden"
              />
            </label>
          </div>

          {/* Gmail Direct Export Card */}
          <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-black text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-rose-600" />
                <span>
                  {isAr ? 'إرسال كناش الكريدي مباشرة إلى Gmail' : 'Send Credit Ledger to Gmail'}
                </span>
              </div>
              {wsUser?.email && !needsAuth && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  ✓ {wsUser.email}
                </span>
              )}
            </div>

            {needsAuth ? (
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {isAr
                    ? 'سجّل الدخول بحساب Google لإرسال ملف كناش الكريدي مباشرة إلى بريدك في Gmail:'
                    : 'Sign in with Google to attach and send the credit ledger via Gmail:'}
                </span>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoggingIn}
                  className="gsi-material-button inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 text-xs font-bold shadow-2xs hover:bg-slate-50"
                >
                  <span className="gsi-material-button-content-wrapper flex items-center gap-2">
                    <span className="gsi-material-button-icon w-4 h-4 shrink-0">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        style={{ display: 'block', width: '100%', height: '100%' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                      </svg>
                    </span>
                    <span className="gsi-material-button-contents">
                      {isLoggingIn ? (isAr ? 'جاري الربط...' : 'Connecting...') : 'Sign in with Google'}
                    </span>
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      {isAr ? 'البريد الإلكتروني (Gmail المستلم)' : 'Recipient Gmail'}
                    </label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="name@gmail.com"
                      dir="ltr"
                      className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      {isAr ? 'عنوان الرسالة' : 'Email Subject'}
                    </label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    {isAr ? 'ملاحظة مرفقة (اختياري)' : 'Optional Note'}
                  </label>
                  <input
                    type="text"
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                    placeholder={
                      isAr ? 'مثال: نسخة احتياطية لكناش الكريدي نهاية الأسبوع...' : 'e.g. Weekly credit ledger...'
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <button
                  type="button"
                  disabled={
                    isGenerating || !recipientEmail.trim() || analytics.scopedCustomers.length === 0
                  }
                  onClick={() => setConfirmSendOpen(true)}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 transition-colors"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>
                    {isAr
                      ? `إرسال كناش الكريدي (${analytics.scopedCustomers.length} زبون) إلى Gmail`
                      : `Send Credit Ledger (${analytics.scopedCustomers.length} customers) to Gmail`}
                  </span>
                </button>
              </div>
            )}
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}
        </div>
      </div>

      {/* Mandatory Explicit Confirmation Dialog before Gmail Send */}
      {confirmSendOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h4 className="font-black text-sm text-slate-900 dark:text-white">
                  {isAr ? 'تأكيد إرسال كناش الكريدي عبر Gmail' : 'Confirm Credit Ledger Gmail Send'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setConfirmSendOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {isAr
                ? `سيتم إرسال بريد إلكتروني عبر حسابك في Gmail إلى "${recipientEmail.trim()}" مرفقاً بملف كناش الكريدي (${analytics.scopedCustomers.length} زبون، ${analytics.scopedTransactions.length} حركة، بإجمالي دين معلق ${analytics.totalOutstandingDebt.toFixed(
                    2
                  )} ${currencySymbol}) بصيغة ${format.toUpperCase()}.`
                : `An email will be sent via Gmail to "${recipientEmail.trim()}" with ${analytics.scopedCustomers.length} customers and ${analytics.scopedTransactions.length} credit transactions (${format.toUpperCase()}).`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSendOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmedSendGmail()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black"
              >
                {isAr ? 'تأكيد الإرسال الآن' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog before Overwriting Local Ledger from Imported JSON */}
      {pendingRestoreJson && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h4 className="font-black text-sm text-slate-900 dark:text-white">
                  {isAr ? 'تأكيد استيراد كناش الكريدي' : 'Confirm Restore Credit Ledger'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPendingRestoreJson(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {isAr
                ? `سيتم استبدال بيانات كناش الكريدي الحالية بمحتويات الملف "${pendingRestoreJson.filename}" (${pendingRestoreJson.customersCount} زبون و ${pendingRestoreJson.txCount} حركة).`
                : `Current credit ledger data will be replaced with "${pendingRestoreJson.filename}" (${pendingRestoreJson.customersCount} customers, ${pendingRestoreJson.txCount} transactions).`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingRestoreJson(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={confirmRestoreLedgerJson}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black"
              >
                {isAr ? 'تأكيد الاستيراد' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
