/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as constants from "../constants.js";
import type * as generate from "../generate.js";
import type * as generateAuth from "../generateAuth.js";
import type * as generateDraft from "../generateDraft.js";
import type * as generateHelpers from "../generateHelpers.js";
import type * as generateRag from "../generateRag.js";
import type * as generateStages from "../generateStages.js";
import type * as generateTypes from "../generateTypes.js";
import type * as generateValidation from "../generateValidation.js";
import type * as images from "../images.js";
import type * as postSummaries from "../postSummaries.js";
import type * as posts from "../posts.js";
import type * as styleProfiles from "../styleProfiles.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  constants: typeof constants;
  generate: typeof generate;
  generateAuth: typeof generateAuth;
  generateDraft: typeof generateDraft;
  generateHelpers: typeof generateHelpers;
  generateRag: typeof generateRag;
  generateStages: typeof generateStages;
  generateTypes: typeof generateTypes;
  generateValidation: typeof generateValidation;
  images: typeof images;
  postSummaries: typeof postSummaries;
  posts: typeof posts;
  styleProfiles: typeof styleProfiles;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
