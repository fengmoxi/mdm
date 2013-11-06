
var policy = (function () {

    var userModule = require('user.js').user;
    var user;

    var usergModule = require('user_group.js').user_group;
    var userg

    var groupModule = require('group.js').group;
    var group;

    var deviceModule = require('device.js').device;
    var device;

    var common = require("common.js");


    var configs = {
        CONTEXT: "/"
    };
    var routes = new Array();
    var log = new Log();
    var db;

    var module = function (dbs) {
        db = dbs;
        user = new userModule(db);
        userg = new usergModule(db);
        group = new groupModule(db);
        device = new deviceModule(db);
        //mergeRecursive(configs, conf);
    };

    function mergeRecursive(obj1, obj2) {
        for (var p in obj2) {
            try {
                // Property in destination object set; update its value.
                if (obj2[p].constructor == Object) {
                    obj1[p] = mergeRecursive(obj1[p], obj2[p]);
                } else {
                    obj1[p] = obj2[p];
                }
            } catch (e) {
                // Property in destination object not set; create it and set its value.
                obj1[p] = obj2[p];
            }
        }
        return obj1;
    }
    function policyByOsType(jsonData,os){
        for(var n=0;n<jsonData.length;n++){
            if(jsonData[n].code == '509B'||jsonData[n].code == '528B'){
                var apps = jsonData[n].data;
                var appsByOs = new Array();
                for(var k=0;k<apps.length;k++){
                    if(apps[k].os == os){
                        appsByOs.push(apps[k]);
                    }
                }
                var obj1 = {};
                obj1.code = jsonData[n].code;
                obj1.data = appsByOs;
                jsonData[n] = obj1;
            }
        }
        return  jsonData;
    }
    function getPolicyIdFromDevice(deviceId){
        var devices = db.query("SELECT * from devices where id = ?",deviceId);
        var userId = devices[0].user_id;

        var upresult = db.query("SELECT policies.id as id FROM policies, user_policy_mapping where policies.id = user_policy_mapping.policy_id && user_policy_mapping.user_id = ?",userId);
        if(upresult!=undefined && upresult != null && upresult[0] != undefined && upresult[0] != null ){
            return upresult[0].id;
        }

        var ppresult = db.query("SELECT policies.id as id FROM policies,platform_policy_mapping where policies.id = platform_policy_mapping.policy_id && platform_policy_mapping.platform_id = ?",platform);
        if(ppresult!=undefined && ppresult != null && ppresult[0] != undefined && ppresult[0] != null ){
            return ppresult[0].id;
        }
        var roleList = user.getUserRoles({'username':userId});
        var removeRoles = new Array("Internal/everyone", "portal", "wso2.anonymous.role", "reviewer","private_kasun:wso2mobile.com");
        var roles = common.removeNecessaryElements(roleList,removeRoles);
        var role = roles[0];
        var gpresult = db.query("SELECT policies.id as id FROM policies,group_policy_mapping where policies.id = group_policy_mapping.policy_id && group_policy_mapping.group_id = ?",role+'');
        return gpresult[0].id;
    }
    // prototype
    module.prototype = {
        constructor: module,

        updatePolicy:function(ctx){
            var result;
            var policy = db.query("SELECT * FROM policies where name = ?",ctx.policyName);
            if(policy!= undefined && policy != null && policy[0] != undefined && policy[0] != null){
                log.info("Content >>>>>"+stringify( ctx.policyData));
                result = db.query("UPDATE policies SET content= ?,type = ? WHERE name = ?",ctx.policyData, ctx.policyType, ctx.policyName);
                log.info("Result >>>>>>>"+result);
            }else{
                result = this.addPolicy(ctx);
            }
            return result;
        },
        addPolicy: function(ctx){
            var existingPolicies =  db.query("SELECT * from  policies WHERE name = ?",ctx.policyName);
            if(existingPolicies != undefined && existingPolicies != null && existingPolicies[0] != undefined && existingPolicies[0] != null ){
                return 409;
            }
            var result = db.query("insert into policies (name,content,type,category) values (?,?,?,?)",ctx.policyName,ctx.policyData,ctx.policyType,1);
            log.info("Result >>>>>>>"+result);
            return 201;
        },
        getAllPolicies:function(ctx){
            var result = db.query("SELECT * FROM policies");
            return result;
        },
        getPolicy:function(ctx){
            var result = db.query("SELECT * FROM policies where id = ?",ctx.policyid);
            return result[0];
        },
        deletePolicy:function(ctx){
            var result = db.query("DELETE FROM policies where id = ?",ctx.policyid);
            db.query("DELETE FROM group_policy_mapping where policy_id = ?",ctx.policyid);
            return result;
        },
        assignGroupsToPolicy:function(ctx){
            this.assignUsersToPolicy(ctx);
            this.assignPlatformsToPolicy(ctx);
            var deletedGroups = ctx.removed_groups;
            var newGroups = ctx.added_groups;
            var policyId = ctx.policyid;

            for(var i = 0; i< deletedGroups.length;i++){
                var result = db.query("DELETE FROM group_policy_mapping WHERE group_policy_mapping.policy_id = ? && group_policy_mapping.group_id = ? ",policyId,deletedGroups[i]);
                log.info("Result1 >>>>>"+result);
            }
            for(var i = 0; i< newGroups.length;i++){
                try{
                    var result =db.query(" INSERT INTO group_policy_mapping (group_id,policy_id) VALUES (?,?)",newGroups[i],policyId);
                    log.info("Result2 >>>>>"+result);
                }catch(e){
                    log.info("ERROR Occured >>>>>");
                }
            }
        },
        assignUsersToPolicy:function(ctx){
            var deletedUsers = ctx.removed_users;
            var newUsers = ctx.added_users;
            var policyId = ctx.policyid;

            for(var i = 0; i< deletedUsers.length;i++){
                var result = db.query("DELETE FROM user_policy_mapping WHERE user_policy_mapping.policy_id = ? && user_policy_mapping.user_id = ? ",policyId,deletedUsers[i]);
                log.info("Result1 >>>>>"+result);
            }
            for(var i = 0; i< newUsers.length;i++){
                try{
                    var result =db.query(" INSERT INTO user_policy_mapping (user_id,policy_id) VALUES (?,?)",newUsers[i],policyId);
                    log.info("Result2 >>>>>"+result);
                }catch(e){
                    log.info("ERROR Occured >>>>>");
                }
            }
        },
        assignPlatformsToPolicy:function(ctx){
            var deletedPlatforms = ctx.removed_platforms;
            var newPlatforms = ctx.added_platforms;
            var policyId = ctx.policyid;

            for(var i = 0; i< deletedPlatforms.length;i++){
                var result = db.query("DELETE FROM platform_policy_mapping WHERE platform_policy_mapping.policy_id = ? && platform_policy_mapping.platform_id = ? ",policyId,deletedPlatforms[i]);
                log.info("Result1 >>>>>"+result);
            }
            for(var i = 0; i< newPlatforms.length;i++){
                try{
                    var result =db.query(" INSERT INTO platform_policy_mapping (platform_id,policy_id) VALUES (?,?)",newPlatforms[i],policyId);
                    log.info("Result2 >>>>>"+result);
                }catch(e){
                    log.info("ERROR Occured >>>>>");
                }
            }
        },
        getGroupsByPolicy:function(ctx){
            var totalGroups = group.getAllGroups({});
            var removeRoles = new Array("Internal/store", "Internal/publisher", "Internal/reviewer");
            var allGroups = common.removeNecessaryElements(totalGroups,removeRoles);
            var result = db.query("SELECT * FROM group_policy_mapping WHERE group_policy_mapping.policy_id = ? ",ctx.policyid);

            var array = new Array();
            if(result == undefined || result == null || result[0] == undefined || result[0] == null){
                for(var i =0; i < allGroups.length;i++){
                    var element = {};
                    element.name = allGroups[i];
                    element.available = false;
                    array[i] = element;
                }
            }else{
                for(var i =0; i < allGroups.length;i++){
                    var element = {};
                    for(var j=0 ;j< result.length;j++){
                        if(allGroups[i]==result[j].group_id){
                            element.name = allGroups[i];
                            element.available = true;
                            break;
                        }else{
                            element.name = allGroups[i];
                            element.available = false;
                        }
                    }
                    array[i] = element;
                }
            }
            log.info("TEst >>>"+stringify(array));
            return array;
        },
        getUsersByPolicy:function(ctx){
            var allUsers = user.getAllUsers(ctx);
            var result = db.query("SELECT * FROM user_policy_mapping WHERE user_policy_mapping.policy_id = ?",ctx.policyid);
            var array = new Array();
            if(result == undefined || result == null || result[0] == undefined || result[0] == null){
                for(var i =0; i < allUsers.length;i++){
                    var element = {};
                    element.name = allUsers[i].username;
                    element.available = false;
                    array[i] = element;
                }
            }else{
                for(var i =0; i < allUsers.length;i++){
                    var element = {};
                    for(var j=0 ;j< result.length;j++){
                        log.info(allUsers[i].username+" "+result[j].user_id);
                        if(allUsers[i].username==result[j].user_id){
                            element.name = allUsers[i].username;
                            element.available = true;
                            break;
                        }else{
                            element.name = allUsers[i].username;
                            element.available = false;
                        }
                    }
                    array[i] = element;
                }
            }

            return array;
        },
        getPlatformsByPolicy:function(ctx){
            var allPlatforms =new Array('android','ios');
            var result = db.query("SELECT * FROM platform_policy_mapping WHERE platform_policy_mapping.policy_id = ? ",ctx.policyid);

            var array = new Array();
            if(result == undefined || result == null || result[0] == undefined || result[0] == null){
                for(var i =0; i < allPlatforms.length;i++){
                    var element = {};
                    element.name = allPlatforms[i];
                    element.available = false;
                    array[i] = element;
                }
            }else{
                for(var i =0; i < allPlatforms.length;i++){
                    var element = {};
                    for(var j=0 ;j< result.length;j++){
                        if(allPlatforms[i]==result[j].platform_id){
                            element.name = allPlatforms[i];
                            element.available = true;
                            break;
                        }else{
                            element.name = allPlatforms[i];
                            element.available = false;
                        }
                    }
                    array[i] = element;
                }
            }

            return array;
        },
        enforcePolicy:function(ctx){
            var policyId =  ctx.policy_id;
            var policies = db.query("SELECT * from policies where id = ?",policyId);
            var payLoad = parse(policies[0].content);

            var users1 = db.query("SELECT * from user_policy_mapping where policy_id=?",policyId);
            for(var i = 0;i<users1.length;i++){
                var devices1 = db.query("SELECT * from devices where user_id = ?",users1[i].user_id);
                for(var j = 0;j<devices1.length;j++){
                    device.sendToDevice({'deviceid':devices1[j].id,'operation':'500P','data':payLoad});
                }
            }
            var platforms =  db.query("SELECT * from platform_policy_mapping where policy_id=?",policyId);
            for(var i = 0;i<platforms.length;i++){
                var platformId = "";
                if(platforms[i].platform_id == 'android'){
                    var devices2 = db.query("SELECT * from devices where platform_id = ?",String(1));
                    for(var j=0;j<devices2.length;j++){
                        var tempId = getPolicyIdFromDevice(devices2[j].id);
                        if(tempId == policyId){
                            device.sendToDevice({'deviceid':devices2[i].id,'operation':'500P','data':payLoad});
                        }
                    }

                }else{
                    var devices3 = db.query("SELECT * from devices where platform_id > ?",String(1));
                    for(var j=0;j<devices3.length;j++){
                        var tempId = getPolicyIdFromDevice(devices3[j].id);
                        if(tempId == policyId){
                            device.sendToDevice({'deviceid':devices3[i].id,'operation':'500P','data':payLoad});
                        }
                    }
                }

            }
            var groups =  db.query("SELECT * from group_policy_mapping where policy_id=?",policyId);
            for(var i = 0;i<groups.length;i++){
                var users2 = group.getUsersOfGroup({'groupid':groups[i].group_id});
                for(var j=0;j<users2.length;j++){
                    var devices4 = db.query("SELECT * from devices where user_id = ?",users2[j].username);
                    for(var k = 0;k<devices4.length;k++){
                        var tempId = getPolicyIdFromDevice(devices4[k].id);
                        if(tempId == policyId){
                            device.sendToDevice({'deviceid':devices4[k].id,'operation':'500P','data':payLoad});
                        }
                    }
                }
            }

        },
        monitoring:function(ctx){
            setInterval(
           	 function(ctx){
	                device.monitor(ctx);
	            }
            ,100000);
        },
        removePolicyFromGroup:function(ctx){
        //    var result = db.query("INSERT INTO group_policy_mapping (user_id,policy_id) values (?,?)",ctx.uid,ctx.pid);
        //    return result;
        },
        assignPolicyToUser:function(ctx){

            return result;
        }

    };
    // return module
    return module;
})();