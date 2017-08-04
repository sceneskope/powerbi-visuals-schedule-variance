module powerbi.extensibility.visual {
  import DataViewObjectsParser = powerbi.extensibility.utils.dataview.DataViewObjectsParser;

  export module Roles {
    export const Category = "category";
    export const UpperLimit = "upperLimit";
    export const UpperCore = "upperCore";
    export const UpperCentral = "upperCentral";
    export const LowerCentral = "lowerCentral";
    export const LowerCore = "lowerCore";
    export const LowerLimit = "lowerLimit";
  }

  export class Settings extends DataViewObjectsParser {
    public colors = new ColorSettings();
    public categoryAxis = new CategoryAxisSettings();
    public valueAxis = new ValueAxisSettings();
  }

  export class ColorSettings {
    public upperColor = "";
    public upperCoreColor = "";
    public centralColor = "";
    public lowerCoreColor = "";
    public lowerColor = "";
  }

  export class CategoryAxisSettings {
    public show = true;
    public showAxisTitle = false;
    public displayUnits: number = 0;
    public precision: number = 2;
    public title = "";
    public color = "";
    public fontSize = 12;
  }

  export class ValueAxisSettings {
    public show = true;
    public showAxisTitle = false;
    public maxValue: number|null = null;
    public minValue: number|null = null;
    public displayUnits: number = 0;
    public precision: number = 2;
    public title = "";
    public color = "";
    public fontSize = 12;
  }
}
