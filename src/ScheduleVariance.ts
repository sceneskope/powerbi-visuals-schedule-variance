module powerbi.extensibility.visual {
    import type = powerbi.extensibility.utils.type;
    import tooltip = powerbi.extensibility.utils.tooltip;
    import formatting = powerbi.extensibility.utils.formatting;
    import interactivity = powerbi.extensibility.utils.interactivity;
    import svgUtils = powerbi.extensibility.utils.svg;
    import axisUtils = powerbi.extensibility.utils.chart.axis;

    export class ScheduleVariance implements IVisual {
        private static readonly NullPrimitive = (null as any) as d3.Primitive;
        private static readonly Chart = svgUtils.CssConstants.createClassAndSelector("chart");
        private static readonly Axes = svgUtils.CssConstants.createClassAndSelector("axes");
        private static readonly Axis = svgUtils.CssConstants.createClassAndSelector("axis");
        private static readonly XAxis = svgUtils.CssConstants.createClassAndSelector("xAxis");
        private static readonly YAxis = svgUtils.CssConstants.createClassAndSelector("yAxis");
        private static readonly Legends = svgUtils.CssConstants.createClassAndSelector("legends");
        private static readonly ClassName = "scheduleVariance";

        private static ttiInfo = 0;
        private static readonly Config = {
            minWidth: 100,
            minHeight: 100,
            xScalePadding: 0.1,
            solidOpacity: 1,
            transparentOpacity: 0.5,
            minMargins: {
                top: 0,
                right: 0,
                bottom: 50,
                left: 0,
            },
            xAxisFontMultiplier: 0.04,
            yAxisFontMultiplier: 0.04,
            maxMarginFactor: 0.25,
            marginTopFactor: 2,
            minCategoryAxisHeight: 20,
            minValueAxisWidth: 30,
        };

        private viewportIn?: IViewport;
        private viewport?: IViewport;
        private dataViews?: DataView[];
        private xScale?: d3.scale.Ordinal<any, any>;
        private yScale?: d3.scale.Ordinal<any, any>;

        private readonly behavior: Behavior;
        private readonly interactivityService: interactivity.IInteractivityService;
        private readonly legend: d3.Selection<SVGGElement>;
        private readonly axes: d3.Selection<SVGGElement>;
        private readonly main: d3.Selection<SVGGElement>;
        private readonly clearCatcher: d3.Selection<SVGGElement>;
        private readonly rootElement: d3.Selection<HTMLDivElement>;
        private readonly xAxis: d3.Selection<SVGGElement>;
        private readonly yAxis: d3.Selection<SVGGElement>;
        private readonly xGrid: d3.Selection<SVGGElement>;
        private readonly tooltipService: tooltip.ITooltipServiceWrapper;
        private readonly host: IVisualHost;
        private model?: Model;
        private readonly chart: d3.Selection<SVGGElement>;

        constructor(options: VisualConstructorOptions) {
            this.host = options.host;
            this.tooltipService = tooltip.createTooltipServiceWrapper(
                options.host.tooltipService, options.element);

            const rootElement = this.rootElement = d3.select(options.element)
                .append("svg")
                .classed(ScheduleVariance.ClassName, true);

            this.interactivityService = interactivity.createInteractivityService(options.host);
            this.behavior = new Behavior();

            this.clearCatcher = interactivity.appendClearCatcher(rootElement);
            const main = this.main = rootElement.append("g");
            this.chart = main.append("g").classed(ScheduleVariance.Chart.className, true);
            this.axes = main.append("g").classed(ScheduleVariance.Axes.className, true);
            this.xGrid = this.axes
                .append("g")
                .classed("grid", true);
            this.xAxis = this.axes
                .append("g")
                .classed(ScheduleVariance.Axis.className, true)
                .classed(ScheduleVariance.XAxis.className, true);
            this.yAxis = this.axes
                .append("g")
                .classed(ScheduleVariance.Axis.className, true)
                .classed(ScheduleVariance.YAxis.className, true);
            this.legend = this.main
                .append("g")
                .classed(ScheduleVariance.Legends.className, true);
        }

        private clearViewport() {
            [this.xAxis, this.yAxis, this.legend, this.chart].forEach(s => this.clearElement(s));
        }

        private setSize(viewport: IViewport) {
            this.viewport = viewport;
            const transform = svgUtils.translate(0, 0);
            this.rootElement
                .attr("width", viewport.width)
                .attr("height", viewport.height);

            this.main.attr("transform", transform);
            this.legend.attr("transform", transform);
        }

        private updateViewportIn(widthOfValueAxis: number, heightOfCategoryAxis: number, labelHeight: number) {
            const viewport = this.viewport;
            if (viewport) {
                const width = viewport.width - widthOfValueAxis;
                const height = viewport.height - heightOfCategoryAxis - labelHeight;
                this.viewportIn = { height: height, width: width };
            }
        }

        public update(options: VisualUpdateOptions) {
            this.dataViews = options.dataViews;

            try {
                if (!options
                    || !options.dataViews
                    || !options.dataViews[0]) {
                    this.clearViewport();
                    return;
                }

                const config = ScheduleVariance.Config;
                if ((options.viewport.width < config.minWidth)
                    || (options.viewport.height < config.minHeight)) {
                    this.clearViewport();
                    return;
                }

                this.setSize(options.viewport);
                const dataView = this.dataViews[0];

                this.model = buildModel(dataView, this.host);
                if (!this.model) {
                    this.clearViewport();
                    return;
                }

                this.updateAxes(this.model);
                this.renderChart(this.model);
            }
            catch (ex) {
                console.error("Caught", ex);
            }
        }

        private clearElement(selection: d3.Selection<any>) {
            selection
                .selectAll("*")
                .remove();
        }

        private transformChartAndAxes(xAdjust: number, yAdjust: number) {
            if (this.viewportIn) {
                const offsetToRightAndDown = svgUtils.translate(xAdjust, yAdjust);
                this.chart.attr("transform", offsetToRightAndDown);
                this.axes.attr("transform", offsetToRightAndDown);
                this.xAxis.attr("transform", svgUtils.translate(0, this.viewportIn.height));
                this.yAxis.attr("transform", svgUtils.translate(0, 0));
            }
        }

        private calculateLabelWidth(value: PrimitiveValue, formatter: formatting.IValueFormatter, fontSize: number) {
            const label = formatter.format(value);
            const properties = ScheduleVariance.getTextProperties(fontSize, label);
            return formatting.textMeasurementService.measureSvgTextWidth(properties);
        }

        private calculateLabelHeight(value: PrimitiveValue, formatter: formatting.IValueFormatter, fontSize: number) {
            const label = formatter.format(value);
            const properties = ScheduleVariance.getTextProperties(fontSize, label);
            return formatting.textMeasurementService.measureSvgTextHeight(properties);
        }

        private updateAxes(model: Model) {
            const widthOfValueLabel = model.settings.valueAxis.show
                ? ScheduleVariance.Config.minValueAxisWidth + Math.max(
                    this.calculateLabelWidth(model.minY, model.valueLabelFormatter, model.settings.valueAxis.fontSize),
                    this.calculateLabelWidth(model.maxY, model.valueLabelFormatter, model.settings.valueAxis.fontSize))
                : 0;

            const labelHeight = this.calculateLabelHeight("Ag",
                model.categoryLabelFormatter, model.settings.categoryAxis.fontSize);

            const heightOfCategoryLabel = model.settings.categoryAxis.show
                ? ScheduleVariance.Config.minCategoryAxisHeight + labelHeight
                : 0;

            this.updateViewportIn(widthOfValueLabel, heightOfCategoryLabel, labelHeight);
            this.transformChartAndAxes(widthOfValueLabel, labelHeight);

            const viewportWidth = this.viewportIn && this.viewportIn.width || 1;
            const viewportHeight = this.viewportIn && this.viewportIn.height || 1;

            const yAxis = axisUtils.createAxis({
                pixelSpan: viewportHeight,
                dataDomain: [model.minY, model.maxY],
                metaDataColumn: model.valueMetadata,
                formatString: formatting.valueFormatter.getFormatStringByColumn(model.valueMetadata),
                outerPadding: 0.5,
                isVertical: true,
                isScalar: true,
                useTickIntervalForDisplayUnits: true,
                isCategoryAxis: false,
                scaleType: axisUtils.scale.linear,
                getValueFn: i => i,
                is100Pct: true,
                categoryThickness: 1,
                shouldClamp: true
            });
            this.yScale = yAxis.scale;

            if (model.settings.valueAxis.show) {
                const axis = yAxis.axis
                    .tickFormat(i => model.valueLabelFormatter.format(i));

                this.yAxis
                    .attr("font-size", type.PixelConverter.fromPointToPixel(model.settings.valueAxis.fontSize))
                    .call(axis);
            } else {
                this.clearElement(this.yAxis);
            }

            const xAxis = axisUtils.createAxis({
                pixelSpan: viewportWidth,
                dataDomain: model.dataPoints.map((_, i) => i),
                metaDataColumn: model.categoryMetadata,
                formatString: formatting.valueFormatter.getFormatStringByColumn(model.categoryMetadata),
                getValueFn: i => model.dataPoints[i].category,
                outerPadding: 0.5,
                isVertical: false,
                isScalar: false,
                isCategoryAxis: true,
                is100Pct: true,
            });
            this.xScale = xAxis.scale;

            if (model.settings.categoryAxis.show) {
                const textProperties = ScheduleVariance.getTextProperties(model.settings.categoryAxis.fontSize);
                const willFit = axisUtils.LabelLayoutStrategy.willLabelsFit(xAxis,
                    viewportWidth,
                    utils.formatting.textMeasurementService.measureSvgTextWidth,
                    textProperties
                );
                const textSelectors = this.xAxis
                    .attr("font-size", type.PixelConverter.fromPointToPixel(model.settings.categoryAxis.fontSize))
                    .call(xAxis.axis)
                    .selectAll("text");

                if (!willFit) {
                    textSelectors
                        .style("text-anchor", "end")
                        .attr("dx", "-0.5em")
                        .attr("transform", "rotate(-35)");

                } else {
                    textSelectors
                        .style("text-anchor", "middle")
                        .attr("dx", ScheduleVariance.NullPrimitive)
                        .attr("transform", ScheduleVariance.NullPrimitive);

                }

                const xGrid = yAxis.axis.ticks(yAxis.values.length)
                    .tickSize(viewportWidth)
                    .tickFormat("")
                    .orient("right");

                this.xGrid.call(
                    xGrid
                );

            } else {
                this.clearElement(this.xAxis);
            }
        }

        private static getTextProperties(pointSize: number, text?: string): formatting.TextProperties {
            return {
                fontFamily: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
                fontSize: type.PixelConverter.fromPoint(pointSize),
                text: text
            };
        }

        private renderChart(model: Model) {
            const dataPoints = model.dataPoints;

            const groups = this.chart.selectAll(".group")
                .data(dataPoints);

            groups.exit().remove();

            groups.enter().append("g")
                .classed("group", true);

            const xScale = this.xScale || d3.scale.ordinal<any, any>();
            const yScale = this.yScale || d3.scale.ordinal<any, any>();

            groups.attr("transform", (_, i) => `translate(${xScale(i)}, 0)`)
                .attr("fill-opacity", 1);

            this.bindSelectionHandler(groups);

            const bars = groups.selectAll("rect")
                .data<DataRange>(dp => dp.ranges);

            bars.enter().append("rect")
                .classed("subbar", true);

            bars.attr("width", xScale.rangeBand())
                .attr("height", dp => yScale(dp.minValue) - yScale(dp.maxValue))
                .attr("y", dp => yScale(dp.maxValue))
                .attr("fill", dp => dp.color);

            this.tooltipService.addTooltip<DataPoint>(
                this.chart,
                tte => tte.data.tooltipInfo!,
                tte => tte.data.identity,
                true);
        }

        private bindSelectionHandler(columns: d3.selection.Update<DataPoint>) {
            if (!this.model) {
                return;
            }

            const options = {
                columns,
                clearCatcher: this.clearCatcher,
                interactivityService: this.interactivityService
            };
            this.interactivityService.bind(this.model.dataPoints, this.behavior, options);
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions)
            : VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
            const settings = this.model && this.model.settings || Settings.getDefault() as Settings;
            const instanceEnumeration = Settings.enumerateObjectInstances(settings, options);
            return instanceEnumeration;
        }
    }
}
