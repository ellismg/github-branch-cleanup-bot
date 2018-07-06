import * as pulumi from "@pulumi/pulumi";
import * as dynamic from "@pulumi/pulumi/dynamic";

class RandomProvider implements dynamic.ResourceProvider {    
    check = (olds: any, news: any) => {
		return Promise.resolve({});
    };
    
    diff = (id: pulumi.ID, olds: any, news: any) => {            
        return Promise.resolve({});
    };

    create = async (inputs: any) => {
        const crypto = await import("crypto");
        const value = crypto.randomBytes(32).toString("base64");
        
        return {
            id: value,
            outs: {
                value: value,
            }
        };
    }

    update = (id: string, olds: any, news: any) => {
        return Promise.resolve({});
    }

    delete = async (id: pulumi.ID, props: any) => {
        return Promise.resolve();
    }
}

export class RandomResource extends dynamic.Resource {
    public readonly value : pulumi.Output<string>;

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super(new RandomProvider(), name, {value: undefined}, opts);
    }
}
