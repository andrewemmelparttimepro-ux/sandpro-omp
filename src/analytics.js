const clarityProjectId = (import.meta.env.VITE_MICROSOFT_CLARITY_PROJECT_ID || '').trim();

const isValidProjectId = (value) => /^[a-z0-9]{6,20}$/i.test(value || '');

export function installMicrosoftClarity() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (!isValidProjectId(clarityProjectId)) return false;
  if (window.clarity?.__sandproInstalled) return true;

  window.clarity = window.clarity || function clarityQueue() {
    (window.clarity.q = window.clarity.q || []).push(arguments);
  };
  window.clarity.__sandproInstalled = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${clarityProjectId}`;
  script.dataset.sandproAnalytics = 'microsoft-clarity';

  const firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(script, firstScript);
  return true;
}
