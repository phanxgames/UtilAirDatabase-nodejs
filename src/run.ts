import {UtilAirDatabase} from "./UtilAirDatabase";


new UtilAirDatabase();
(async () => {
    try {
        await UtilAirDatabase.createDatabaseFromSQLFile("test.sql", "test.db");
    } catch (e) {
        console.error(e);
    }
})();