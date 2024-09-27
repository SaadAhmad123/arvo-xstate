import { IArvoActor } from "./types";
import { z } from "zod";

export default class ArvoActor<
  TInputType extends string = string,
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TCompleteType extends string = string,
  TComplete extends z.ZodTypeAny = z.ZodTypeAny,
>{
  constructor (param: IArvoActor<TInputType, TInput, TCompleteType, TComplete>) {
    
  }
}