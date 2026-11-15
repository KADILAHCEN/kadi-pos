import React, { useEffect, useState, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  Cloud,
  CloudUpload,
  Mail,
  RefreshCw,
  Trash2,
  Download,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  LogOut,
  FileJson,
  FileText,
  X,
  Send,
  CalendarClock
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import {
  BACKUP_FOLDER_NAME,
  GoogleDriveFileItem,
  deleteDriveFile,
  downloadDriveFileText,
  ensureKadiDriveFolder,
  getWorkspaceAccessToken,
  initGoogleWorkspaceAuth,
  listDriveFolderFiles,
  sendGmailHtmlMessage,
  sendGmailMessageWithAttachment,
  signInWithGoogleWorkspace,
  signOutGoogleWorkspace,
  uploadFileToDriveFolder
} from '../../utils/googleWorkspace';
import { buildScheduledFinancialEmailHtml } from '../../utils/exportReports';
import {
  buildCatalogEmailSummaryHtml,
  buildPortableCatalogHtml,
  buildPortableCatalogJson,
  prepareCatalogExportItems,
  utf8StringToBase64
} from '../../utils/catalogGmailExport';
import {
  buildCreditLedgerEmailSummaryHtml,
  buildPortableCreditLedgerHtml,
  buildPortableCreditLedgerJson
} from '../../utils/creditLedgerGmailExport';

type PendingWorkspaceAction =
  | { type: 'upload_backup' }
  | { type: 'upload_report' }
  | { type: 'restore_file'; file: GoogleDriveFileItem }
  | { type: 'delete_file'; file: GoogleDriveFileItem }
  | { type: 'send_gmail'; to: string }
  | { type: 'send_catalog_gmail'; to: string }
  | { type: 'send_credit_gmail'; to: string };

export const GoogleWorkspaceSyncSection: React.FC = () => {
  const {
    settings,
    updateSettings,
    buildFullBackupObject,
    importDatabaseJson,
    orders,
    expenses,
    products,
    categories,
    customers,
    creditTransactions,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [wsUser, setWsUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(() => !getWorkspaceAccessToken());
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [folderId, setFolderId] = useState<string | undefined>(settings.driveBackupFolderId);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingWorkspaceAction | null>(null);

  // Scheduled Gmail & Drive report preferences
  const [schedEnabled, setSchedEnabled] = useState<boolean>(settings.scheduledReportEnabled ?? false);
  const [schedEmail, setSchedEmail] = useState<string>(settings.scheduledReportEmail || settings.email || '');
  const [schedFreq, setSchedFreq] = useState<'daily' | 'weekly'>(settings.scheduledReportFrequency || 'weekly');
  const [schedAutoDrive, setSchedAutoDrive] = useState<boolean>(settings.scheduledReportAutoDrive ?? false);

  const loadDriveFiles = useCallback(
    async (preferredFolderId?: string) => {
      if (!getWorkspaceAccessToken()) {
        setNeedsAuth(true);
        return;
      }
      setIsLoadingFiles(true);
      try {
        const ensuredId = await ensureKadiDriveFolder(preferredFolderId || folderId);
        if (ensuredId !== folderId) {
          setFolderId(ensuredId);
          updateSettings({ driveBackupFolderId: ensuredId });
        }
        const files = await listDriveFolderFiles(ensuredId);
        setDriveFiles(files);
        setNeedsAuth(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'AUTH_REQUIRED' || msg === 'AUTH_EXPIRED') {
          setNeedsAuth(true);
        } else {
          setStatusBanner({
            type: 'error',
            text: msg || (isAr ? 'تعذر تحميل ملفات Google Drive' : 'Failed to load Google Drive files')
          });
        }
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [folderId, updateSettings, isAr]
  );

  useEffect(() => {
    const unsub = initGoogleWorkspaceAuth(
      (user) => {
        setWsUser(user);
        setNeedsAuth(false);
        if (!schedEmail && user.email) {
          setSchedEmail(user.email);
        }
      },
      () => {
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, [schedEmail]);

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setStatusBanner(null);
    try {
      const { user } = await signInWithGoogleWorkspace();
      setWsUser(user);
      setNeedsAuth(false);
      if (!schedEmail && user.email) {
        setSchedEmail(user.email);
      }
      await loadDriveFiles(folderId);
      setStatusBanner({
        type: 'success',
        text: isAr
          ? `تم الاتصال بحساب Google (${user.email || 'متصل'}) بنجاح`
          : `Connected to Google (${user.email || 'active'})`
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed';
      setStatusBanner({ type: 'error', text: msg });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleWorkspace();
    setWsUser(null);
    setNeedsAuth(true);
    setDriveFiles([]);
    setStatusBanner({
      type: 'success',
      text: isAr ? 'تم قطع الاتصال بحساب Google Workspace' : 'Disconnected from Google Workspace'
    });
  };

  const handleSaveSchedulePrefs = () => {
    updateSettings({
      scheduledReportEnabled: schedEnabled,
      scheduledReportEmail: schedEmail.trim(),
      scheduledReportFrequency: schedFreq,
      scheduledReportAutoDrive: schedAutoDrive
    });
    setStatusBanner({
      type: 'success',
      text: isAr ? 'تم حفظ إعدادات التقارير التلقائية والمزامنة' : 'Scheduled report settings saved'
    });
    setTimeout(() => setStatusBanner(null), 3500);
  };

  const executeConfirmedAction = async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    setIsBusy(true);
    setStatusBanner(null);

    try {
      if (action.type === 'upload_backup') {
        const ensuredId = await ensureKadiDriveFolder(folderId);
        const backupObj = buildFullBackupObject();
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        const filename = `KadiPOS_Backup_${stamp}.json`;
        await uploadFileToDriveFolder({
          folderId: ensuredId,
          filename,
          content: JSON.stringify(backupObj, null, 2),
          mimeType: 'application/json'
        });
        updateSettings({
          driveBackupFolderId: ensuredId,
          lastBackupAt: new Date().toISOString()
        });
        await loadDriveFiles(ensuredId);
        setStatusBanner({
          type: 'success',
          text: isAr
            ? `تم رفع النسخة الاحتياطية (${filename}) إلى مجلد "${BACKUP_FOLDER_NAME}"`
            : `Uploaded backup (${filename}) to "${BACKUP_FOLDER_NAME}"`
        });
      } else if (action.type === 'upload_report') {
        const ensuredId = await ensureKadiDriveFolder(folderId);
        const html = buildScheduledFinancialEmailHtml({
          settings,
          orders,
          expenses,
          products,
          currencySymbol
        });
        const stamp = new Date().toISOString().slice(0, 10);
        const filename = `KadiPOS_Financial_Report_${stamp}.html`;
        await uploadFileToDriveFolder({
          folderId: ensuredId,
          filename,
          content: `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>${html}</body></html>`,
          mimeType: 'text/html'
        });
        await loadDriveFiles(ensuredId);
        setStatusBanner({
          type: 'success',
          text: isAr
            ? `تم حفظ التقرير المالي (${filename}) في Google Drive`
            : `Saved financial report (${filename}) to Google Drive`
        });
      } else if (action.type === 'restore_file') {
        const rawJson = await downloadDriveFileText(action.file.id);
        const ok = importDatabaseJson(rawJson);
        if (!ok) {
          throw new Error(isAr ? 'صيغة ملف النسخة الاحتياطية غير صالحة' : 'Invalid backup JSON file format');
        }
        setStatusBanner({
          type: 'success',
          text: isAr
            ? `تمت استعادة قاعدة البيانات من "${action.file.name}" بنجاح`
            : `Database restored cleanly from "${action.file.name}"`
        });
      } else if (action.type === 'delete_file') {
        await deleteDriveFile(action.file.id);
        setDriveFiles((prev) => prev.filter((f) => f.id !== action.file.id));
        setStatusBanner({
          type: 'success',
          text: isAr ? `تم حذف "${action.file.name}" من Google Drive` : `Deleted "${action.file.name}" from Drive`
        });
      } else if (action.type === 'send_gmail') {
        const htmlBody = buildScheduledFinancialEmailHtml({
          settings,
          orders,
          expenses,
          products,
          currencySymbol
        });
        const subject = isAr
          ? `التقرير المالي والمخزني - ${settings.storeName || 'Kadi POS'} (${new Date().toLocaleDateString('ar-MA')})`
          : `Financial & Inventory Summary - ${settings.storeName || 'Kadi POS'} (${new Date().toISOString().slice(0, 10)})`;
        await sendGmailHtmlMessage({
          to: action.to,
          subject,
          htmlBody
        });
        updateSettings({
          lastScheduledReportSentAt: new Date().toISOString(),
          scheduledReportEmail: action.to
        });
        setStatusBanner({
          type: 'success',
          text: isAr
            ? `تم إرسال التقرير المالي عبر Gmail إلى ${action.to} بنجاح`
            : `Financial report sent via Gmail to ${action.to}`
        });
      } else if (action.type === 'send_catalog_gmail') {
        const exportItems = await prepareCatalogExportItems(products, categories, true);
        const stamp = new Date().toISOString().slice(0, 10);
        const htmlFile = buildPortableCatalogHtml({
          items: exportItems,
          settings,
          currencySymbol
        });
        const jsonFile = buildPortableCatalogJson({
          items: exportItems,
          settings,
          currencySymbol
        });
        const emailBody = buildCatalogEmailSummaryHtml({
          items: exportItems,
          settings,
          currencySymbol
        });
        await sendGmailMessageWithAttachment({
          to: action.to,
          subject: isAr
            ? `كتالوج السلع والصور والأثمان - ${settings.storeName || 'Kadi POS'} (${stamp})`
            : `Catalog with Photos & Prices - ${settings.storeName || 'Kadi POS'} (${stamp})`,
          htmlBody: emailBody,
          attachments: [
            {
              filename: `KadiPOS_Catalog_Images_${stamp}.html`,
              mimeType: 'text/html; charset=utf-8',
              contentBase64: utf8StringToBase64(htmlFile)
            },
            {
              filename: `KadiPOS_Catalog_Data_${stamp}.json`,
              mimeType: 'application/json; charset=utf-8',
              contentBase64: utf8StringToBase64(jsonFile)
            }
          ]
        });
        setStatusBanner({
          type: 'success',
          text: isAr
            ? `تم إرسال ملف السلع والصور والأثمان (${exportItems.length} سلعة) إلى ${action.to} عبر Gmail`
            : `Catalog (${exportItems.length} items with photos) sent via Gmail to ${action.to}`
        });
      } else if (action.type === 'send_credit_gmail') {
        const stamp = new Date().toISOString().slice(0, 10);
        const htmlFile = buildPortableCreditLedgerHtml({
          customers,
          creditTransactions,
          settings,
          currencySymbol,
          scope: 'all'
        });
        const jsonFile = buildPortableCreditLedgerJson({
          customers,
          creditTransactions,
          settings,
          currencySymbol,
          scope: 'all'
        });
        const emailBody = buildCreditLedgerEmailSummaryHtml({
          customers,
          creditTransactions,
          settings,
          currencySymbol,
          scope: 'all'
        });
        await sendGmailMessageWithAttachment({
          to: action.to,
          subject: isAr
            ? `كناش الكريدي وحسابات الزبناء - ${settings.storeName || 'Kadi POS'} (${stamp})`
            : `Credit Ledger Backup - ${settings.storeName || 'Kadi POS'} (${stamp})`,
          htmlBody: emailBody,
          attachments: [
            {
              filename: `KadiPOS_CreditLedger_${stamp}.html`,
              mimeType: 'text/html; charset=utf-8',
              contentBase64: utf8StringToBase64(htmlFile)
            },
            {
              filename: `KadiPOS_CreditLedger_Data_${stamp}.json`,
              mimeType: 'application/json; charset=utf-8',
              contentBase64: utf8StringToBase64(jsonFile)
            }
          ]
        });
        setStatusBanner({
          type: 'success',
          text: isAr
            ? `تم إرسال كناش الكريدي (${customers.length} زبون و ${creditTransactions.length} حركة) إلى ${action.to} عبر Gmail`
            : `Credit Ledger (${customers.length} customers) sent via Gmail to ${action.to}`
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Workspace operation failed';
      if (msg === 'AUTH_REQUIRED' || msg === 'AUTH_EXPIRED') {
        setNeedsAuth(true);
        setStatusBanner({
          type: 'error',
          text: isAr
            ? 'انتهت جلسة Google المؤقتة. المرجو تسجيل الدخول مجدداً للمتابعة.'
            : 'Google access session expired. Please sign in again.'
        });
      } else {
        setStatusBanner({ type: 'error', text: msg });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const renderConfirmDetails = (action: PendingWorkspaceAction) => {
    if (action.type === 'upload_backup') {
      return {
        title: isAr ? 'تأكيد رفع النسخة الاحتياطية إلى Google Drive' : 'Confirm Google Drive Backup Upload',
        body: isAr
          ? `سيتم إنشاء ورفع ملف نسخة احتياطية JSON كامل للمبيعات والمنتجات ودفتر الكريدي وضرائب CPU إلى مجلد "${BACKUP_FOLDER_NAME}" في حسابك على Google Drive.`
          : `A full JSON backup of your store data will be uploaded to "${BACKUP_FOLDER_NAME}" in your Google Drive.`,
        confirmLabel: isAr ? 'رفع إلى Drive الآن' : 'Upload to Drive',
        danger: false
      };
    }
    if (action.type === 'upload_report') {
      return {
        title: isAr ? 'تأكيد حفظ التقرير المالي في Google Drive' : 'Confirm Financial Report Upload',
        body: isAr
          ? `سيتم توليد ملف التقرير المالي والمخزني الحالي وحفظه داخل مجلد "${BACKUP_FOLDER_NAME}" في Google Drive.`
          : `The current financial and inventory summary report will be uploaded to "${BACKUP_FOLDER_NAME}" in Google Drive.`,
        confirmLabel: isAr ? 'حفظ التقرير في Drive' : 'Save Report to Drive',
        danger: false
      };
    }
    if (action.type === 'restore_file') {
      return {
        title: isAr ? 'تأكيد استعادة النسخة الاحتياطية من Drive' : 'Confirm Backup Restore from Drive',
        body: isAr
          ? `سيتم استبدال البيانات المحلية الحالية بمحتويات الملف "${action.file.name}". تأكد من أخذ نسخة احتياطية حديثة قبل الاستمرار.`
          : `Current local store data will be replaced with "${action.file.name}". Make sure you want to overwrite local data.`,
        confirmLabel: isAr ? 'استعادة البيانات الآن' : 'Restore Database',
        danger: true
      };
    }
    if (action.type === 'delete_file') {
      return {
        title: isAr ? 'تأكيد حذف ملف من Google Drive' : 'Confirm Delete from Google Drive',
        body: isAr
          ? `هل أنت متأكد من حذف الملف "${action.file.name}" نهائياً من Google Drive؟ لا يمكن التراجع عن هذا الإجراء.`
          : `Are you sure you want to permanently delete "${action.file.name}" from Google Drive?`,
        confirmLabel: isAr ? 'تأكيد الحذف' : 'Delete File',
        danger: true
      };
    }
    if (action.type === 'send_catalog_gmail') {
      return {
        title: isAr ? 'تأكيد إرسال ملف السلع والصور عبر Gmail' : 'Confirm Send Catalog with Photos via Gmail',
        body: isAr
          ? `سيتم إرسال ملف يحتوي على ${products.length} سلعة مع صورها وأثمانها (HTML + JSON) عبر حسابك في Gmail إلى "${action.to}".`
          : `Files containing ${products.length} products, prices, and embedded photos (HTML + JSON) will be sent via Gmail to "${action.to}".`,
        confirmLabel: isAr ? 'إرسال ملف السلع عبر Gmail' : 'Send Catalog via Gmail',
        danger: false
      };
    }
    if (action.type === 'send_credit_gmail') {
      return {
        title: isAr ? 'تأكيد إرسال كناش الكريدي عبر Gmail' : 'Confirm Send Credit Ledger via Gmail',
        body: isAr
          ? `سيتم إرسال ملف كناش الكريدي (${customers.length} زبون و ${creditTransactions.length} حركة دين وأداء بصيغة HTML + JSON) عبر حسابك في Gmail إلى "${action.to}".`
          : `Credit ledger files (${customers.length} customers, ${creditTransactions.length} transactions in HTML + JSON) will be sent via Gmail to "${action.to}".`,
        confirmLabel: isAr ? 'إرسال كناش الكريدي عبر Gmail' : 'Send Ledger via Gmail',
        danger: false
      };
    }
    return {
      title: isAr ? 'تأكيد إرسال التقرير عبر Gmail' : 'Confirm Send Report via Gmail',
      body: isAr
        ? `سيتم إرسال رسالة بريد إلكتروني عبر حسابك في Gmail إلى العنوان "${action.to}" تتضمن ملخص المبيعات والأرباح والمصاريف وتنبيهات المخزون.`
        : `An HTML financial summary email will be sent via your Gmail account to "${action.to}".`,
      confirmLabel: isAr ? 'إرسال عبر Gmail الآن' : 'Send via Gmail',
      danger: false
    };
  };

  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Cloud className="w-4 h-4 text-blue-600" />
            <span>
              {isAr
                ? 'المزامنة السحابية عبر Google Drive وتقارير Gmail'
                : isFr
                ? 'Synchronisation Google Drive & Rapports Gmail'
                : 'Google Drive Cloud Backup & Gmail Reports'}
            </span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {isAr
              ? 'احفظ نسخك الاحتياطية في مجلد Kadi POS Backups وأرسل ملخصات المبيعات والربح مباشرة عبر Gmail.'
              : 'Store encrypted JSON backups in Kadi POS Backups on Google Drive and send financial summaries via Gmail.'}
          </p>
        </div>

        {/* Auth Status / Sign-in Controls */}
        {needsAuth ? (
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoggingIn}
            className="gsi-material-button inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 text-xs font-bold shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            <span className="gsi-material-button-state" />
            <span className="gsi-material-button-content-wrapper flex items-center gap-2.5">
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
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
              </span>
              <span className="gsi-material-button-contents">
                {isLoggingIn
                  ? isAr
                    ? 'جاري الربط...'
                    : 'Connecting...'
                  : 'Sign in with Google'}
              </span>
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{wsUser?.email || (isAr ? 'حساب Google متصل' : 'Google Connected')}</span>
            </span>
            <button
              type="button"
              onClick={handleGoogleSignOut}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{isAr ? 'فصل' : 'Disconnect'}</span>
            </button>
          </div>
        )}
      </div>

      {statusBanner && (
        <div
          className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 border ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          <span className="flex items-center gap-2">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="p-1 opacity-70 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Drive Actions & File Browser */}
      {!needsAuth && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setPendingAction({ type: 'upload_backup' })}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-2 shadow-2xs disabled:opacity-60 transition-colors"
            >
              <CloudUpload className="w-4 h-4" />
              <span>{isAr ? 'رفع نسخة احتياطية JSON إلى Drive' : 'Upload JSON Backup to Drive'}</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => setPendingAction({ type: 'upload_report' })}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-2 shadow-2xs disabled:opacity-60 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>{isAr ? 'حفظ التقرير المالي في Drive' : 'Save Financial Report to Drive'}</span>
            </button>

            <button
              type="button"
              disabled={isLoadingFiles || isBusy}
              onClick={() => loadDriveFiles()}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
              <span>{isAr ? 'تحديث الملفات' : 'Refresh Files'}</span>
            </button>
          </div>

          {/* Drive Folder File List */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/70 dark:bg-slate-950/60">
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-blue-500" />
                <span>
                  {isAr ? `مجلد Google Drive: ${BACKUP_FOLDER_NAME}` : `Drive Folder: ${BACKUP_FOLDER_NAME}`}
                </span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {driveFiles.length} {isAr ? 'ملفات' : 'files'}
              </span>
            </div>

            {driveFiles.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                {isLoadingFiles
                  ? isAr
                    ? 'جاري قراءة الملفات من Google Drive...'
                    : 'Loading files from Google Drive...'
                  : isAr
                  ? 'لا توجد ملفات مرفوعة في مجلد Kadi POS Backups بعد. اضغط على "رفع نسخة احتياطية" أعلاه للبدء.'
                  : 'No backups uploaded yet in Kadi POS Backups.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {driveFiles.map((file) => {
                  const isJson = file.name.endsWith('.json') || file.mimeType.includes('json');
                  return (
                    <div
                      key={file.id}
                      className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 hover:bg-white dark:hover:bg-slate-900 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isJson ? (
                          <FileJson className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {file.name}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : ''}{' '}
                            {file.size ? `· ${(Number(file.size) / 1024).toFixed(1)} KB` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isJson && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setPendingAction({ type: 'restore_file', file })}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold hover:bg-emerald-100 flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>{isAr ? 'استعادة' : 'Restore'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setPendingAction({ type: 'delete_file', file })}
                          className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[11px] font-bold hover:bg-rose-100 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{isAr ? 'حذف' : 'Delete'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scheduled Financial Reports & Instant Gmail Send */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900 dark:text-white">
            <Mail className="w-4 h-4 text-rose-500" />
            <span>
              {isAr
                ? 'تقارير البريد الإلكتروني (Gmail) والجدولة التلقائية'
                : 'Gmail Financial Summary & Scheduled Sync'}
            </span>
          </div>
          {settings.lastScheduledReportSentAt && (
            <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
              <CalendarClock className="w-3.5 h-3.5" />
              <span>
                {isAr ? 'آخر إرسال:' : 'Last sent:'}{' '}
                {new Date(settings.lastScheduledReportSentAt).toLocaleString()}
              </span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              {isAr ? 'بريد استلام التقرير المالي' : 'Recipient Email'}
            </label>
            <input
              type="email"
              value={schedEmail}
              onChange={(e) => setSchedEmail(e.target.value)}
              placeholder="owner@store.com"
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              {isAr ? 'وتيرة الجدولة عند فتح التطبيق' : 'Schedule Frequency'}
            </label>
            <select
              value={schedFreq}
              onChange={(e) => setSchedFreq(e.target.value as 'daily' | 'weekly')}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
            >
              <option value="daily">{isAr ? 'يومي (كل 24 ساعة)' : 'Daily (Every 24h)'}</option>
              <option value="weekly">{isAr ? 'أسبوعي (كل 7 أيام)' : 'Weekly (Every 7d)'}</option>
            </select>
          </div>

          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={schedAutoDrive}
                onChange={(e) => setSchedAutoDrive(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600"
              />
              <span>{isAr ? 'رفع تلقائي لـ Drive أثناء الجلسة' : 'Auto Drive Backup when connected'}</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={schedEnabled}
                onChange={(e) => setSchedEnabled(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600"
              />
              <span>{isAr ? 'تفعيل التذكير بالتقرير الدوري' : 'Enable Scheduled Report Tracking'}</span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleSaveSchedulePrefs}
            className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
          >
            {isAr ? 'حفظ تفضيلات الجدولة' : 'Save Schedule Preferences'}
          </button>

          {!needsAuth && (
            <>
              <button
                type="button"
                disabled={isBusy || !schedEmail.trim()}
                onClick={() => setPendingAction({ type: 'send_gmail', to: schedEmail.trim() })}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isAr ? 'إرسال التقرير المالي الآن عبر Gmail' : 'Send Financial Report via Gmail Now'}</span>
              </button>

              <button
                type="button"
                disabled={isBusy || !schedEmail.trim()}
                onClick={() => setPendingAction({ type: 'send_catalog_gmail', to: schedEmail.trim() })}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isAr ? 'إرسال ملف السلع والصور إلى Gmail' : 'Send Catalog + Photos to Gmail'}</span>
              </button>

              <button
                type="button"
                disabled={isBusy || !schedEmail.trim()}
                onClick={() => setPendingAction({ type: 'send_credit_gmail', to: schedEmail.trim() })}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isAr ? 'إرسال كناش الكريدي إلى Gmail' : 'Send Credit Ledger to Gmail'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Explicit React Confirmation Dialog for ALL Google Workspace Write/Delete/Send Operations */}
      {pendingAction && (() => {
        const meta = renderConfirmDetails(pendingAction);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`p-2 rounded-xl ${
                      meta.danger
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300'
                    }`}
                  >
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <h4 className="font-black text-sm text-slate-900 dark:text-white">{meta.title}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{meta.body}</p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={executeConfirmedAction}
                  className={`px-4 py-2 rounded-xl text-xs font-black text-white ${
                    meta.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {meta.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
