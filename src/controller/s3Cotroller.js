const aws = require("aws-sdk");

aws.config.update({
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    region: process.env.AWS_REGION
});

const s3 = new aws.S3();

const uploadFile = (bucketName, fileName, fileData) => {
    const params = {
        Bucket: bucketName,
        Key: fileName,
        Body: fileData
    };

    s3.upload(params, function (s3Err, data) {
        if (s3Err) throw s3Err;
        console.log(`File uploaded successfully at ${data.Location}`);
    });
}

module.exports = { uploadFile };