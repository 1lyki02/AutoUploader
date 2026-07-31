/** Support contacts shown in the profile dialog. Edit these before release. */
export const SUPPORT_CONTACTS = {
  telegram: {
    label: "Telegram",
    value: "@road_support",
    href: "https://t.me/road_support",
  },
  email: {
    label: "Email",
    value: "support@road.app",
    href: "mailto:support@road.app",
  },
} as const;

export const APP_ABOUT = {
  productName: "ROAD",
  tagline: "Публикации по расписанию",
} as const;
