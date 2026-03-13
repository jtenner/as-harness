#include <node_api.h>

extern napi_value GoInit(napi_env env, napi_value exports);

NAPI_MODULE(NODE_GYP_MODULE_NAME, GoInit)
