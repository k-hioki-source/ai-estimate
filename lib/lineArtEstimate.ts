const materials = ['logo', 'line_underlay', '3d_capture', 'photo', 'drawing', 'unknown'] as const;
const workflows = ['trace', 'draw_from_plan', 'reconstruct', 'arrange_exploded', 'unknown'] as const;
const detailTypes = ['overlaps', 'repeated_shapes', 'surface_patterns', 'small_features'] as const;

type Material = typeof materials[number];
type Workflow = typeof workflows[number];
type DetailType = typeof detailTypes[number];

export type LineArtScope = {
  material: Material;
  workflow: Workflow;
  precision: boolean;
  retainedDetails: DetailType[];
  unclearRequiredDetails: boolean;
};

export function readLineArtScope(value: unknown): LineArtScope | undefined {
  if (!value || typeof value !== 'object') return;
  const scope = value as Partial<LineArtScope>;
  if (!materials.includes(scope.material!) || !workflows.includes(scope.workflow!) ||
      typeof scope.precision !== 'boolean' || typeof scope.unclearRequiredDetails !== 'boolean' ||
      !Array.isArray(scope.retainedDetails) || !scope.retainedDetails.every(detail => detailTypes.includes(detail))) return;
  return {
    material: scope.material!,
    workflow: scope.workflow!,
    precision: scope.precision,
    retainedDetails: [...new Set(scope.retainedDetails)],
    unclearRequiredDetails: scope.unclearRequiredDetails,
  };
}

const traceBase = { logo: 1, line_underlay: 1.5, '3d_capture': 2, photo: 2.5 } as const;
const traceLabels = { logo: 'ロゴ', line_underlay: '線画下絵', '3d_capture': '3Dキャプチャ', photo: '写真' } as const;

export function estimateSingleProductLineArt(input: {
  lineArtScope?: LineArtScope;
  visibleComponentCount?: number;
  repeatedDetailCount?: number;
  partDensity?: number;
  lineDifficulty?: number;
  structureComplexity?: number;
}) {
  // Keep dense legacy anchors and multi-product estimates outside this rubric.
  if (!input.lineArtScope || input.visibleComponentCount !== 1 ||
      input.repeatedDetailCount === undefined || input.repeatedDetailCount >= 100) return;
  const highVisualScores = [input.partDensity, input.lineDifficulty, input.structureComplexity]
    .filter(score => (score ?? 0) >= 70).length;
  if (input.lineArtScope.retainedDetails.length > 0 && highVisualScores >= 2) return;
  return estimateLineArt(input.lineArtScope);
}

export function estimateLineArt(scope: LineArtScope) {
  const detailCount = scope.retainedDetails.length;
  const detailed = detailCount >= 2;
  const detailHours = detailed ? 0.5 : 0;
  const unclearHours = scope.unclearRequiredDetails ? 0.5 : 0;

  if (scope.workflow === 'draw_from_plan' && scope.material === 'drawing') {
    return { hours: (detailed ? 4 : 2.5) + unclearHours, label: '図面から作図' };
  }
  if (scope.workflow === 'reconstruct' && scope.material !== 'unknown') {
    return { hours: (detailed ? 5 : 4) + unclearHours, label: '資料をもとに形状を推定して作図' };
  }
  if ((scope.workflow !== 'trace' && scope.workflow !== 'arrange_exploded') ||
      scope.material === 'drawing' || scope.material === 'unknown') return;

  // Equivalent workloads use the material anchors. Clean photo outlines retain
  // the established 1–1.5 h prices regardless of the product's category.
  const easyPhoto = scope.material === 'photo' && detailCount === 0;
  const base = easyPhoto ? (scope.precision ? 1.5 : 1) : traceBase[scope.material];
  const hours = base + detailHours + unclearHours;
  const label = traceLabels[scope.material] + 'トレース';
  return { hours, label: detailed ? label + '・細部あり' : label };
}
