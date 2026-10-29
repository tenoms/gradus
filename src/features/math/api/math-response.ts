export function mathResponseError(response: any): string | undefined {
  if (!response || typeof response !== "object") return;
  const message = String(
    response.Message || response.msg || response.Msg || "",
  );
  const code = response.Code ?? response.code;
  const failedCode =
    code !== undefined &&
    code !== null &&
    code !== "" &&
    !["0", "000", "200"].includes(String(code));
  const failedResult =
    Object.hasOwn(response, "Resule") &&
    [false, 0, -1, "false", "0", "-1"].includes(response.Resule);
  const stack =
    /(?:Exception|MySql|SqlClient|StackTrace|stack trace|\bat\s+[A-Za-z_$][\w.$]*\s*\(|System\.[A-Z]\w+)/i.test(
      message,
    );
  const failedMessage =
    /失败|异常|无效|没有权限|无权限|权限不足|未登录|请先登录|错误/.test(
      message,
    );
  if (
    response.SuccessResponse === false ||
    failedCode ||
    failedResult ||
    failedMessage ||
    stack
  ) {
    return stack || message.length > 240
      ? "数学平台暂时无法读取这项内容，请稍后重试。"
      : message || "数学平台暂时无法完成请求，请稍后重试。";
  }
}
export function mathResponseData(response: any): any {
  if (response && typeof response === "object") {
    if (Object.hasOwn(response, "data")) return response.data;
    if (Object.hasOwn(response, "Data")) return response.Data;
  }
  return response;
}
