window.SENTIENT_ACCOUNTS_CONFIG = Object.assign(
  {
    refreshApiBaseUrl: "https://sentient-accounts-refresh.onrender.com",
    refreshApiBaseStorageKey: "sentient-accounts-refresh-api-url",
    refreshAdminKeyStorageKey: "sentient-accounts-refresh-admin-key",
    statusPollIntervalMs: 15000,
    maxStatusPollAttempts: 40,
  },
  window.SENTIENT_ACCOUNTS_CONFIG || {}
);
