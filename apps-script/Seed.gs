/**
 * Cleanup utility — run this ONCE if you already ran the earlier
 * "seedFromKaizen" import.
 *
 * Now that Tasks and Upskilling are read LIVE from the "Cedars Daily Kaizen"
 * sheet on every load (see readLiveWorkPlan_ and readLiveUpskilling_ in
 * Code.gs), the historical data that was one-time-imported into the Tasks,
 * Courses, and Learning tabs is now duplicated — the same tasks would be
 * counted once from the live read and again from the old imported copy,
 * inflating everyone's Kaizen numbers.
 *
 * This function clears those three tabs back to empty (headers only). From
 * then on:
 *   - Tasks/Courses/Learning tabs hold ONLY things added directly through
 *     the app (e.g. an ad-hoc task not tracked in the real WorkPlan sheet).
 *   - Everything else comes live from the Kaizen sheet automatically.
 *
 * HOW TO RUN: same as before — select "clearImportedSeed" from the function
 * dropdown next to Run, click Run, approve if asked.
 *
 * Safe to run even if you never ran the old seedFromKaizen — it just clears
 * whatever is there (if anything) back to empty.
 */
function clearImportedSeed() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheets = ensureWorkbook_(ss);

  clearRows_(sheets.tasksSheet, TASKS_HEADERS.length);
  clearRows_(sheets.coursesSheet, COURSES_HEADERS.length);
  clearRows_(sheets.learningSheet, LEARNING_HEADERS.length);

  Logger.log('Cleared Tasks, Courses, and Learning tabs. Kaizen and Upskilling now read live from the Kaizen sheet.');
}

function clearRows_(sheet, colCount) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, colCount).clearContent();
  }
}
