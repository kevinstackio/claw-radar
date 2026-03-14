export const informationText = {
  l1Value: "text-base font-semibold text-foreground",
  l2Value: "text-sm font-medium text-foreground",
  l3Label: "text-[11px] uppercase tracking-wide text-muted-foreground",
  l3Body: "text-sm leading-relaxed text-foreground",
  l4Meta: "text-xs text-muted-foreground",
  rowLabel: "text-[11px] uppercase tracking-wide text-muted-foreground",
  rowValue: "text-sm font-medium text-foreground",
  metaLink: "underline-offset-2 transition-colors hover:text-foreground hover:underline",
};

export const informationLayout = {
  summaryList: "space-y-2",
  summaryRow: "flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2",
  summaryLabelWrap: "flex min-w-0 items-center gap-1",
  summaryHelpTrigger:
    "inline-flex h-3 w-3 items-center justify-center text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  summaryValueWrap: "max-w-[58%] text-right leading-tight break-words",
  noticeBlock: "space-y-3",
  sectionTitle: "text-sm font-semibold text-foreground",
  sectionSubtitle: "text-[11px] text-muted-foreground",
};

export const informationChart = {
  legendFontSize: 11,
  axisFontSize: 10,
  yAxisWidth: 92,
  barRadius: [0, 4, 4, 0] as [number, number, number, number],
  pieCenterY: "57%",
  pieOuterRadius: "62%",
};
