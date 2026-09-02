/* ============================================================
 *  NAKODA MIS — configuration
 *  API_URL is your Apps Script Web App URL (ends in /exec).
 *  CRM_API_URL is the SEPARATE Patient CRM Apps Script Web App URL
 *  (pcList/pcSave/pcLogCall/etc. all go here instead, so CRM work
 *  never locks up Accounts/Attendance/etc. and vice versa).
 * ============================================================ */
window.NAKODA_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbyqVSShH6jsBFYCFhZ-BMa2G5V4VDLYepufI_enlKWutLsi9Jigzo_EmSKSfbj7pO4/exec",
  CRM_API_URL: "https://script.google.com/macros/s/AKfycbxC8FkyB4OHtwZvdVMtFezOOiOCGL5gCPtlbqGubadY854mU6_Dq3itl1V0C71mDL9i5Q/exec",
  APP_NAME: "Nakoda MIS"
};
