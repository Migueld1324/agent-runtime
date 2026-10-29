import { Ajv, type ValidateFunction } from 'ajv';

export type InputSchema = {
  type: 'object'; additionalProperties: false; description?: string;
  properties: Record<string, {type:'string'; description?:string; minLength?:number; maxLength?:number; enum?:string[]}>;
  required: string[];
};
const ajv = new Ajv({strict:true, allErrors:false, coerceTypes:false, useDefaults:false, removeAdditional:false, ownProperties:true});
const validators = new Map<string, ValidateFunction>();
const fail = (): never => { throw new Error('Invalid tool-input/1 schema'); };
export function dataObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  return Reflect.ownKeys(value).every(key => typeof key === 'string' &&
    Object.getOwnPropertyDescriptor(value,key)?.enumerable === true &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)!, 'value'));
}
export function freeze<T>(value:T):T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export function canonical(value:unknown):string {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function validateSchema(value:unknown):InputSchema {
  if (!dataObject(value)) return fail();
  const keys = (o:Record<string,unknown>,allowed:string[]) => { if(Object.keys(o).some(k=>!allowed.includes(k))) fail(); };
  const description = (o:Record<string,unknown>) => {if(Object.hasOwn(o,'description') && (typeof o.description!=='string' || Array.from(o.description).length>300)) fail();};
  keys(value,['type','additionalProperties','description','properties','required']); description(value);
  if(value.type!=='object' || value.additionalProperties!==false || !dataObject(value.properties) || !Array.isArray(value.required)) return fail();
  const names=Object.keys(value.properties);
  if(names.length<1 || names.length>16 || names.some(n=>n.length>64 || !/^[a-z][a-zA-Z0-9_]*$/.test(n) || ['constructor','prototype'].includes(n)) ||
    value.required.length!==names.length || new Set(value.required).size!==names.length || value.required.some(n=>typeof n!=='string'||!names.includes(n))) return fail();
  for(const property of Object.values(value.properties)) {
    if(!dataObject(property)) return fail();
    keys(property,['type','description','minLength','maxLength','enum']); description(property);
    if(property.type!=='string') return fail();
    for(const key of ['minLength','maxLength']) if(Object.hasOwn(property,key) && (!Number.isInteger(property[key]) || (property[key] as number)<0 || (property[key] as number)>65536)) return fail();
    const min=property.minLength as number|undefined, max=property.maxLength as number|undefined;
    if(min!==undefined && max!==undefined && min>max) return fail();
    if(Object.hasOwn(property,'enum')) {
      const values=property.enum;
      if(!Array.isArray(values)||values.length<1||values.length>32||new Set(values).size!==values.length || values.some(v=>typeof v!=='string'||Array.from(v).length>2048||Array.from(v).length<(min??0)||Array.from(v).length>(max??65536))) return fail();
    }
  }
  return freeze(JSON.parse(JSON.stringify(value)) as InputSchema);
}
export function compiled(key:string,schema:InputSchema):ValidateFunction {
  let validator=validators.get(key);
  if(!validator) { validator=ajv.compile(schema); validators.set(key,validator); }
  return validator;
}
