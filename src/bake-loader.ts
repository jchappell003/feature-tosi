import * as YAML from 'js-yaml'
import * as fs from 'fs'
import {BakeVariable} from './bake-library'
import { stringify } from 'querystring';

export interface IBakeAuthentication {
    subscriptionId: string
    tenantId: string,
    serviceId: string,
    secretKey: string,
    certPath: string
}

export interface IBakeEnvironment {
    toolVersion: string,
    environmentName: string,
    environmentCode: string,
    authentication: IBakeAuthentication
    variabes: Map<string, BakeVariable>
}

export interface IIngredientProperties {
    type: string,
    template: string,
    parameters: Map<string,BakeVariable>
}

export interface IIngredient {
    properties: IIngredientProperties,
    dependsOn: Array<string>
}

export interface IBakeConfig {
    name: string,
    shortName: string,
    version: string,
    resourceGroup: boolean,
    rgOverride: BakeVariable,

    variables: Map<string,BakeVariable>
    recipe: Map<string, IIngredient>
}

export interface IBakeRegion {
    name: string
    shortName: string
}

export class BakePackage {
    constructor(source: string) {

        this._env = <IBakeEnvironment>{}
        this._loadEnvironment()

        this._config = <IBakeConfig>{}
        this._loadPackage(source)
    }

    private _env: IBakeEnvironment
    public get  Environment():IBakeEnvironment {

        //strip auth from the public accessor

        //simple JSON wrap to clone config
        let env = JSON.parse(JSON.stringify(this._env))
        env.authentication = null
        return env
    }

    private _config: IBakeConfig
    public get Config(): IBakeConfig {

        return this._config;
    }

    private _loadEnvironment(): void {

        //load environment variables || defaults into an interface
        this._env.toolVersion = process.env.npm_package_version || "0.0.0"

        this._env.environmentName = process.env.BAKE_ENV_NAME || ""
        this._env.environmentCode = process.env.BAKE_ENV_CODE || ""
        
        this._env.authentication = <IBakeAuthentication>{}
        this._env.authentication.subscriptionId = process.env.BAKE_AUTH_SUBSCRIPTION_ID || ""
        this._env.authentication.tenantId = process.env.BAKE_AUTH_TENANT_ID || ""
        this._env.authentication.serviceId = process.env.BAKE_AUTH_SERVICE_ID || ""
        this._env.authentication.secretKey = process.env.BAKE_AUTH_SERVICE_KEY || ""
        this._env.authentication.certPath = process.env.BAKE_AUTH_SERVICE_CERT || ""

        //clear out the auth info
        process.env.BAKE_AUTH_SUBSCRIPTION_ID = process.env.BAKE_AUTH_SERVICE_ID = 
            process.env.BAKE_AUTH_SERVICE_KEY = process.env.BAKE_AUTH_SERVICE_CERT = 
            process.env.BAKE_AUTH_TENANT_ID =""

        //yaml parse out the global variables.
        let obj  =YAML.safeLoad(process.env.BAKE_VARIABLES || "")
        this._env.variabes = this.objToVariableMap( obj || [] )
    }

    private _validatePackage(config: IBakeConfig) {

        if (!config.name)
         throw new Error('config.name not defined')
         if (!config.shortName)
         throw new Error('config.shortName not defined')
         if (!config.version)
         throw new Error('config.version not defined')
    }

    private objToStrMap(obj: any) {
        let strMap = new Map();
        for (let k of Object.keys(obj)) {
            strMap.set(k, obj[k]);
        }
        return strMap;
    }

    private objToVariableMap(obj: any) {
        let strMap = new Map<string,BakeVariable>();
        for (let k of Object.keys(obj)) {
            strMap.set(k, new BakeVariable(obj[k]));
        }
        return strMap;
    }

    private _loadPackage(source: string){

        let file = fs.readFileSync(source, 'utf8')
        let config: IBakeConfig = YAML.load(file)

        //start with config vars based on env based vars
        let vars = this.objToVariableMap(config.variables)

        //merge config vars into the env vars (overwriting as needed)
        config.variables = this._env.variabes
        vars.forEach((v,n)=>config.variables.set(n, v))

        //fix up json objects to act as hashmaps.
        config.rgOverride = new BakeVariable(<any>config.rgOverride);
        config.recipe = this.objToStrMap(config.recipe)
        config.recipe.forEach(ingredient=>{
            ingredient.dependsOn = ingredient.dependsOn || []
            ingredient.properties = ingredient.properties || <IIngredientProperties>{}
            ingredient.properties.parameters = this.objToVariableMap(ingredient.properties.parameters || {})
        })

        this._validatePackage(config)
        this._config = config
    }

    public Authenticate( callback: (auth:IBakeAuthentication)=>boolean ) : boolean {
        return callback(this._env.authentication)
    }

}