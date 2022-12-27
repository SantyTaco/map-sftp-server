const aws = require("aws-sdk");

aws.config.update({
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    region: process.env.AWS_REGION
});

const s3 = new aws.S3();

const uploadFile = async (bucketName, fileName, fileData) => {
    try {
        const params = {
            Bucket: bucketName,
            Key: `TestFolder${fileName}`,
            Body: fileData
        };
    
        const data = await s3.upload(params).promise()
        return data;
    } catch(error) {
        throw error;
    }
}

const getDirectoryList = async (prefix) => {
    const newPrefix = prefix != '/' ? prefix : '';
    try {
        const params = {
            Bucket: "santytest",
            Delimiter: '/',
            Prefix: 'TestFolder/' + newPrefix
           };
    
        const data = await s3.listObjectsV2(params).promise();
        return data;
    } catch(error) {
        throw error;
    }
    
}

module.exports = { uploadFile, getDirectoryList };