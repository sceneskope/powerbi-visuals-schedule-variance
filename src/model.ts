
module powerbi.extensibility.visual {
    import DataRoleHelper = powerbi.extensibility.utils.dataview.DataRoleHelper;
    import TooltipEnabledDataPoint = powerbi.extensibility.utils.tooltip.TooltipEnabledDataPoint;
    import formatting = powerbi.extensibility.utils.formatting;
    import interactivity = powerbi.extensibility.utils.interactivity;

    export interface DataRange extends TooltipEnabledDataPoint {
        minValue: number;
        maxValue: number;
        color: string;
        tooltipInfo: VisualTooltipDataItem[];
    }

    export interface DataPoint extends TooltipEnabledDataPoint, interactivity.SelectableDataPoint {
        category: string;
        ranges: DataRange[];
    }

    export interface Model {
        minY: number;
        maxY: number;
        settings: Settings;
        dataPoints: DataPoint[];
        categoryMetadata: DataViewMetadataColumn;
        valueMetadata: DataViewMetadataColumn;
        valueLabelFormatter: formatting.IValueFormatter;
        categoryLabelFormatter: formatting.IValueFormatter;
    }

    function tryGetMetadataColumn(dataview: DataView, role: string) {
        if (dataview.metadata && dataview.metadata.columns) {
            for (const column of dataview.metadata.columns) {
                if (DataRoleHelper.hasRole(column, role)) {
                    return column;
                }
            }
        }

        return undefined;
    }

    function hasCategoryAndCentral(dataview: DataView) {
        if (dataview.metadata
            && dataview.metadata.columns) {
            let hasCategory = false;
            let hasLowerCentral = false;
            let hasUpperCentral = false;
            for (const column of dataview.metadata.columns) {
                if (DataRoleHelper.hasRole(column, Roles.Category)) {
                    hasCategory = true;
                } else if (DataRoleHelper.hasRole(column, Roles.UpperCentral)) {
                    hasUpperCentral = true;
                } else if (DataRoleHelper.hasRole(column, Roles.LowerCentral)) {
                    hasLowerCentral = true;
                }
            }

            return hasCategory && hasLowerCentral && hasUpperCentral;
        }
        else {
            return false;
        }
    }

    interface MeasureInformation {
        index: number;
        values: DataViewValueColumn;
        source: DataViewMetadataColumn;
        formatter: formatting.IValueFormatter;
    }

    function getMeasureIndexIfSet(dataView: DataView,
        grouped: powerbi.DataViewValueColumnGroup[], role: string): MeasureInformation | undefined {
        const hasRole = DataRoleHelper.hasRoleInDataView(dataView, role);
        if (hasRole) {
            const measureIndex = DataRoleHelper.getMeasureIndexOfRole(grouped, role);
            const category = dataView.categorical!.values![measureIndex];
            const formatter = formatting.valueFormatter.create({
                format: formatting.valueFormatter.getFormatStringByColumn(category.source)
            });

            return {
                index: measureIndex,
                values: category,
                source: category.source,
                formatter
            };
        }

        return undefined;
    }

    export function buildModel(dataView: DataView | undefined, host: IVisualHost): Model | undefined {
        if (!dataView
            || !hasCategoryAndCentral(dataView)
            || !dataView.categorical
            || !dataView.categorical.values
            || !dataView.categorical.categories
            || !dataView.categorical.categories.length) {

            return undefined;
        }
        const categoryMetadata = tryGetMetadataColumn(dataView, Roles.Category)!;

        const settings = Settings.parse<Settings>(dataView);
        const categorical = dataView.categorical;
        const values = categorical.values;
        const grouped = values!.grouped();
        const category = categorical.categories![0];
        const upperLimitIndex = getMeasureIndexIfSet(dataView, grouped, Roles.UpperLimit);
        const upperCoreIndex = getMeasureIndexIfSet(dataView, grouped, Roles.UpperCore);
        const upperCentralIndex = getMeasureIndexIfSet(dataView, grouped, Roles.UpperCentral)!;
        const lowerCentralIndex = getMeasureIndexIfSet(dataView, grouped, Roles.LowerCentral)!;
        const lowerCoreIndex = getMeasureIndexIfSet(dataView, grouped, Roles.LowerCore);
        const lowerLimitIndex = getMeasureIndexIfSet(dataView, grouped, Roles.LowerLimit);

        let minValue = Number.MAX_VALUE;
        let maxValue = -Number.MAX_VALUE;
        const tryGetValue = (index: number, measureInformation: MeasureInformation | undefined,
            tooltips: VisualTooltipDataItem[]): number | undefined => {
            if (measureInformation !== undefined) {
                const value = measureInformation.values.values[index] as number;
                if (value < minValue) {
                    minValue = value;
                }
                if (value > maxValue) {
                    maxValue = value;
                }
                tooltips.push({
                    displayName: measureInformation.source.displayName,
                    value: measureInformation.formatter.format(value)
                });
                return value;
            }
        };

        const defaultColor = host.colorPalette.getColor("bar").value;

        const formatter = formatting.valueFormatter.create({
            format: formatting.valueFormatter.getFormatStringByColumn(category.source)
        });
        const dataPoints: DataPoint[] = category.values.map((value, index) => {
            const ranges: DataRange[] = [];
            const tooltips: VisualTooltipDataItem[] = [];

            tooltips.push({ displayName: category.source.displayName, value: formatter.format(value) });

            const upperValue = tryGetValue(index, upperLimitIndex, tooltips);
            const upperCoreValue = tryGetValue(index, upperCoreIndex, tooltips);
            const upperCentralValue = tryGetValue(index, upperCentralIndex, tooltips);
            const lowerCentralValue = tryGetValue(index, lowerCentralIndex, tooltips);
            const lowerCoreValue = tryGetValue(index, lowerCoreIndex, tooltips);
            const lowerValue = tryGetValue(index, lowerLimitIndex, tooltips);

            const addRangeIfSet = (lowValue: number | undefined,
                highValue: number | undefined,
                color: string) => {
                if ((lowValue !== undefined) && (highValue !== undefined)) {
                    const range = {
                        minValue: lowValue,
                        maxValue: highValue,
                        color: (color.length) ? color : defaultColor,
                        tooltipInfo: tooltips
                    };
                    ranges.push(range);
                }
            };

            addRangeIfSet(lowerValue, lowerCoreValue, settings.colors.lowerColor);
            addRangeIfSet(lowerCoreValue, lowerCentralValue, settings.colors.lowerCoreColor);
            addRangeIfSet(lowerCentralValue, upperCentralValue, settings.colors.centralColor);
            addRangeIfSet(upperCentralValue, upperCoreValue, settings.colors.upperCoreColor);
            addRangeIfSet(upperCoreValue, upperValue, settings.colors.upperColor);

            const selectionId = host.createSelectionIdBuilder()
                .withCategory(category, index)
                .createSelectionId();

            return {
                category: value as string,
                ranges: ranges,
                tooltipInfo: tooltips,
                selected: false,
                identity: selectionId
            };
        });

        const minY = (settings.valueAxis.minValue !== null) && (settings.valueAxis.minValue < maxValue)
            ? settings.valueAxis.minValue
            : minValue;

        const maxY = (settings.valueAxis.maxValue !== null) && (settings.valueAxis.maxValue > minValue)
            ? settings.valueAxis.maxValue
            : maxValue;

        const valueMetadata = tryGetMetadataColumn(dataView, Roles.UpperCentral)!;

        return {
            categoryMetadata: categoryMetadata,
            valueMetadata: valueMetadata,
            minY: minY,
            maxY: maxY,
            settings: settings,
            dataPoints: dataPoints,
            valueLabelFormatter: formatting.valueFormatter.create({
                format: formatting.valueFormatter.getFormatStringByColumn(valueMetadata, true),
                value: settings.valueAxis.displayUnits,
                precision: settings.valueAxis.precision
            }),
            categoryLabelFormatter: formatting.valueFormatter.create({
                format: formatting.valueFormatter.getFormatStringByColumn(categoryMetadata, true),
                value: settings.categoryAxis.displayUnits,
                precision: settings.categoryAxis.precision
            })
        };
    }
}
