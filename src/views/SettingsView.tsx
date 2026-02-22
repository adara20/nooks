import React, { useState, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Download, Upload, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { repository } from '../services/repository';
import { db } from '../db';
import {
  exportData,
  triggerDownload,
  getExportFilename,
  validateBackup,
  mergeData,
  getLastExportDate,
  setLastExportDate,
  type NooksBackup,
} from '../services/backupService';
import { cn } from '../utils/cn';

interface SettingsViewProps {
  onBack: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onBack }) => {
  const [lastExport, setLastExport] = useState<Date | null>(getLastExportDate);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [pendingBackup, setPendingBackup] = useState<NooksBackup | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStale = lastExport === null || Date.now() - lastExport.getTime() >= 3 * 24 * 60 * 60 * 1000;

  const handleExport = async () => {
    const buckets = await repository.getAllBuckets();
    const tasks = await repository.getAllTasks();
    const json = exportData(buckets, tasks);
    triggerDownload(json, getExportFilename());
    setLastExportDate();
    setLastExport(new Date());
    setImportSuccess('Backup downloaded successfully.');
    setTimeout(() => setImportSuccess(null), 3000);
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!validateBackup(parsed)) {
          setImportError('This file doesn\'t look like a valid Nooks backup. Please try again.');
          return;
        }
        setPendingBackup(parsed);
        setIsImportModalOpen(true);
      } catch {
        setImportError('Could not read that file. Make sure it\'s a valid JSON backup.');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected if needed
    e.target.value = '';
  };

  const handleReplace = async () => {
    setIsImportModalOpen(false);
    setIsReplaceConfirmOpen(true);
  };

  const handleReplaceConfirmed = async () => {
    if (!pendingBackup) return;
    await db.tasks.clear();
    await db.buckets.clear();
    for (const bucket of pendingBackup.buckets) {
      const { id: _id, ...rest } = bucket;
      await repository.addBucket(rest);
    }
    for (const task of pendingBackup.tasks) {
      const { id: _id, ...rest } = task;
      await repository.addTask(rest);
    }
    setPendingBackup(null);
    setIsReplaceConfirmOpen(false);
    setImportSuccess('All data restored from backup.');
    setTimeout(() => setImportSuccess(null), 4000);
  };

  const handleMerge = async () => {
    if (!pendingBackup) return;
    const existingBuckets = await repository.getAllBuckets();
    const existingTasks = await repository.getAllTasks();
    const { buckets: newBuckets, tasks: newTasks } = mergeData(
      { buckets: existingBuckets, tasks: existingTasks },
      { buckets: pendingBackup.buckets, tasks: pendingBackup.tasks }
    );

    // We need to map incoming task bucketIds to newly inserted bucket IDs
    // Build name→newId map for newly added buckets
    const bucketNameToNewId = new Map<string, number>();
    for (const b of newBuckets) {
      const newId = await repository.addBucket(b);
      bucketNameToNewId.set(b.name.toLowerCase(), newId);
    }

    // Build full name→id map (existing + newly inserted)
    const existingBuckets2 = await repository.getAllBuckets();
    const bucketNameToId = new Map<string, number>();
    for (const b of existingBuckets2) {
      bucketNameToId.set(b.name.toLowerCase(), b.id!);
    }

    // Map incoming task bucketIds via bucket name
    for (const task of newTasks) {
      const incomingBucket = pendingBackup.buckets.find(b => b.id === task.bucketId);
      const resolvedBucketId = incomingBucket
        ? bucketNameToId.get(incomingBucket.name.toLowerCase())
        : undefined;
      await repository.addTask({ ...task, bucketId: resolvedBucketId });
    }

    setPendingBackup(null);
    setIsImportModalOpen(false);
    const added = newBuckets.length + newTasks.length;
    setImportSuccess(`Merged! Added ${added} new item${added !== 1 ? 's' : ''}.`);
    setTimeout(() => setImportSuccess(null), 4000);
  };

  return (
    <div className="p-6 pb-32 space-y-8">
      {/* Header */}
      <header className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
          <ArrowLeft size={24} />
        </Button>
        <h1 className="text-3xl font-display font-bold text-nook-ink">Settings</h1>
      </header>

      {/* Feedback messages */}
      {importError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium" role="alert">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{importError}</span>
        </div>
      )}
      {importSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-2xl text-green-700 text-sm font-medium" role="status">
          {importSuccess}
        </div>
      )}

      {/* Backup section */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-nook-ink/40 px-1">Data Backup</h2>

        {/* Last backup indicator */}
        <Card className={cn(
          'space-y-1',
          isStale ? 'border-nook-orange/40 bg-orange-50/50' : ''
        )}>
          <p className="text-xs font-bold uppercase tracking-widest text-nook-ink/40">Last Backup</p>
          <p className={cn(
            'text-lg font-bold',
            isStale ? 'text-nook-orange' : 'text-nook-ink'
          )}>
            {lastExport
              ? `${formatDistanceToNow(lastExport, { addSuffix: true })}`
              : 'No backup yet'}
          </p>
        </Card>

        {/* Export */}
        <Button
          className="w-full py-4 flex items-center justify-center gap-3"
          onClick={handleExport}
          data-testid="export-button"
        >
          <Download size={20} />
          Export Data
        </Button>

        {/* Import */}
        <Button
          variant="secondary"
          className="w-full py-4 flex items-center justify-center gap-3"
          onClick={handleImportClick}
          data-testid="import-button"
        >
          <Upload size={20} />
          Import Backup
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
          data-testid="file-input"
          aria-label="Import backup file"
        />

        <p className="text-xs text-nook-ink/40 text-center px-4">
          Backups include all your buckets and tasks. Store the file somewhere safe.
        </p>
      </section>

      {/* Import choice modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => { setIsImportModalOpen(false); setPendingBackup(null); }}
        title="Import Backup"
      >
        <div className="space-y-4">
          <p className="text-nook-ink/70">What would you like to do with your existing data?</p>
          <div className="space-y-3">
            <Button
              variant="secondary"
              className="w-full py-4"
              onClick={handleMerge}
              data-testid="merge-button"
            >
              Merge — add new items, skip duplicates
            </Button>
            <Button
              variant="danger"
              className="w-full py-4"
              onClick={handleReplace}
              data-testid="replace-button"
            >
              Replace — wipe current data and restore
            </Button>
            <Button
              variant="ghost"
              className="w-full py-3"
              onClick={() => { setIsImportModalOpen(false); setPendingBackup(null); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Replace confirmation modal */}
      <Modal
        isOpen={isReplaceConfirmOpen}
        onClose={() => setIsReplaceConfirmOpen(false)}
        title="Are you sure?"
      >
        <div className="space-y-4">
          <p className="text-nook-ink/70">
            This will <strong>delete all your current data</strong> and restore from the backup file. This cannot be undone.
          </p>
          <div className="space-y-3">
            <Button
              variant="danger"
              className="w-full py-4"
              onClick={handleReplaceConfirmed}
              data-testid="confirm-replace-button"
            >
              Yes, replace everything
            </Button>
            <Button
              variant="ghost"
              className="w-full py-3"
              onClick={() => setIsReplaceConfirmOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
