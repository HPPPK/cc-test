#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>
#import <objc/runtime.h>
#include <stdio.h>

extern int cchh_request_notification_authorization(char *, uintptr_t);
static NSString *scenario;
@interface FakeNotificationCenter : NSObject
@property(nonatomic, strong) id delegate;
@end
@implementation FakeNotificationCenter
- (void)requestAuthorizationWithOptions:(UNAuthorizationOptions)options completionHandler:(void (^)(BOOL, NSError *))handler {
    if ([scenario isEqualToString:@"denied"]) handler(NO, [NSError errorWithDomain:UNErrorDomain code:UNErrorCodeNotificationsNotAllowed userInfo:nil]);
    else if ([scenario isEqualToString:@"error"]) handler(NO, [NSError errorWithDomain:@"NativeProbeError" code:42 userInfo:@{NSLocalizedDescriptionKey: @"probe service failure"}]);
    else handler([scenario isEqualToString:@"granted"], nil);
}
@end
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        scenario = argc > 1 ? [NSString stringWithUTF8String:argv[1]] : @"denied";
        FakeNotificationCenter *fake = [FakeNotificationCenter new];
        Method method = class_getClassMethod([UNUserNotificationCenter class], @selector(currentNotificationCenter));
        method_setImplementation(method, imp_implementationWithBlock(^id(id cls) { return fake; }));
        char error[1024] = {0};
        int status = cchh_request_notification_authorization(error, sizeof(error));
        NSDictionary *result = @{@"status": @(status), @"error": [NSString stringWithUTF8String:error]};
        NSData *json = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
        puts([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
    }
    return 0;
}
