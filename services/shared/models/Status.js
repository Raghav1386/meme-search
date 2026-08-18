/**
 * Conceptual Processing Status Model
 * Enforces state consistency across Discovery and Ingestion.
 */
export const ProcessingStatus = Object.freeze({
  DISCOVERED: 'DISCOVERED', // Found by Discovery, not yet queued
  QUEUED: 'QUEUED',         // Enqueued in BullMQ
  PROCESSING: 'PROCESSING', // Ingestion worker has picked it up
  COMPLETED: 'COMPLETED',   // Successfully processed, uploaded, and indexed
  FAILED: 'FAILED'          // Permanent or unrecoverable error
});
