// JuryHour design system (docs/WEBSITE_CONTRACTS.md §2 A). Import from "@/components/ui".
// Styles live in ./ui.css (loaded once by the root layout) on top of src/styles/tokens.css.
// The OG template is NOT exported here (keeps it out of client bundles): import "@/components/ui/og".

export { Button, buttonClass, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export { Field, type FieldProps } from "./Field";
export { Input, Textarea, type InputProps, type TextareaProps } from "./Input";
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from "./SegmentedControl";
export { Card, type CardProps } from "./Card";
export { Badge, type BadgeTone } from "./Badge";
export { Tally, type TallyProps } from "./Tally";
export { VerdictStamp } from "./VerdictStamp";
export { JurorQuote, type JurorQuoteProps } from "./JurorQuote";
export { CaseHeader, type CaseHeaderProps } from "./CaseHeader";
export { Scorecard, type ScorecardProps, type ScorecardRow } from "./Scorecard";
export { PriceCard, type PriceCardProps } from "./PriceCard";
export { CompareTable, type CompareTableProps } from "./CompareTable";
export { FAQ, type FAQProps, type FAQItem } from "./FAQ";
export { Banner, type BannerProps } from "./Banner";
export { TimerBar, type TimerBarProps } from "./TimerBar";
export { Section, Container, Eyebrow, type SectionProps, type ContainerProps, type EyebrowProps } from "./Layout";
export { SiteHeader, SiteFooter, AppHeader, AppFooter, SkipLink, Wordmark, Logo, supportEmailAddress } from "./SiteChrome";
export { cx, jurorLabel, formatPrice, tallyCounts, tallyGroups, segmentPanelId, segmentTabId } from "./lib";
export { BRAND_INK, BRAND_PAPER, BRAND_SLASH, LOGO_HORIZONTAL, LOGO_SYMBOL, logoDataUri, logoSvg, type BrandLogo } from "./brand";
