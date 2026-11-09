import { getStore } from '@netlify/blobs';
import {createHandler} from '../../server/assets.mjs';
const handler = createHandler(getStore({name:'examstudio-assets', consistency:'strong'}));
export default request => handler(request);
